import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import type { OrdersRefundPort } from "@hyprpay/orders";
import type { RefundsDatabaseAdapter, RefundsLookupAdapter } from "./contracts/refunds-database-adapter";
import type { RefundsProviderAdapter } from "./contracts/refunds-provider-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type {
  Refund,
  RefundInput,
  RefundListFilter,
  RefundStatus,
  RefundTerminalStatus,
  RefundTransitionInput,
} from "./schemas/refund-schema";
import {
  refundInputSchema,
  refundListFilterSchema,
  refundReasonSchema,
  refundSchema,
  refundStatusSchema,
  refundTerminalStatuses,
  refundTransitionInputSchema,
} from "./schemas/refund-schema";
import { currencySchema, metadataSchema } from "./schemas/shared-schema";

export interface RefundsApi {
  create(input: RefundInput): Promise<BillingResult<Refund>>;
  get(id: string): Promise<BillingResult<Refund | null>>;
  /**
   * Settle a pending refund into a terminal status (succeeded | failed | canceled),
   * emitting the matching status event. Refunds in a terminal status cannot transition.
   */
  transition(input: RefundTransitionInput): Promise<BillingResult<Refund>>;
  listByOrder(orderId: string): Promise<BillingResult<Refund[]>>;
  listByCustomer(customerId: string): Promise<BillingResult<Refund[]>>;
  listBySubscription(subscriptionId: string): Promise<BillingResult<Refund[]>>;
  list(filter: RefundListFilter): Promise<BillingResult<Refund[]>>;
}

export interface RefundsPluginOptions {
  database: RefundsDatabaseAdapter;
  orders: OrdersRefundPort;
  provider?: RefundsProviderAdapter;
}

export type RefundPluginEvent =
  | { type: "billing.refund.created"; payload: Refund }
  | { type: "billing.refund.succeeded"; payload: Refund }
  | { type: "billing.refund.failed"; payload: Refund }
  | { type: "billing.refund.canceled"; payload: Refund };

const invalidBillingInput = <T>(message = "Dados de billing inválidos."): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.INVALID_INPUT(),
      message,
    }),
  );

const notFound = <T>(message: string): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.NOT_FOUND(),
      message,
    }),
  );

const invalidState = <T>(message: string): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.INVALID_STATE(),
      message,
    }),
  );

const emitRefundEvent = async (runtime: HyprPayRuntime, event: RefundPluginEvent) => {
  await runtime.emit(event);
};

const isTerminalStatus = (status: RefundStatus): status is RefundTerminalStatus =>
  (refundTerminalStatuses as readonly RefundStatus[]).includes(status);

// Maps a terminal status to the event that announces it. "pending" is not terminal
// and is announced via billing.refund.created instead.
const transitionEventType = {
  succeeded: "billing.refund.succeeded",
  failed: "billing.refund.failed",
  canceled: "billing.refund.canceled",
} as const satisfies Record<RefundTerminalStatus, RefundPluginEvent["type"]>;

export const refunds = (options: RefundsPluginOptions): HyprPayPlugin<"refunds", RefundsApi> => ({
  id: "refunds",
  namespace: "refunds",
  extendApi: runtime => ({
    create: async (input: RefundInput) => {
      const parsed = refundInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const orderResult = await options.orders.get(parsed.data.orderId);

      if (Result.isError(orderResult)) {
        return Result.err(orderResult.error);
      }

      if (orderResult.value === null) {
        return notFound("Pedido de billing não encontrado.");
      }

      const order = orderResult.value;
      const remaining = order.totalAmount - order.amountRefunded;
      const amount = parsed.data.amount ?? remaining;

      if (amount <= 0) {
        return invalidBillingInput("Valor do reembolso deve ser positivo.");
      }

      if (amount > remaining) {
        return invalidBillingInput("Valor do reembolso excede o saldo disponível do pedido.");
      }

      let providerRefundId: string | undefined;
      // A refund starts "pending" and only settles via transition(). When the
      // provider can report a synchronous outcome, honor it as the initial state.
      let initialStatus: RefundStatus = "pending";

      if (options.provider?.createRefund !== undefined) {
        const providerInput =
          order.providerOrderId === undefined
            ? { orderId: order.id, amount }
            : { orderId: order.id, amount, providerOrderId: order.providerOrderId };

        const providerResult = await options.provider.createRefund(providerInput);

        if (Result.isError(providerResult)) {
          return Result.err(providerResult.error);
        }

        providerRefundId = providerResult.value.providerRefundId;

        if (providerResult.value.status !== undefined) {
          initialStatus = providerResult.value.status;
        }
      }

      const now = new Date().toISOString();
      const isSettledOnCreate = isTerminalStatus(initialStatus);

      const refund: Refund = {
        id: crypto.randomUUID(),
        orderId: parsed.data.orderId,
        amount,
        currency: "BRL",
        reason: parsed.data.reason,
        status: initialStatus,
        createdAt: now,
        ...(order.customerId !== undefined ? { customerId: order.customerId } : {}),
        ...(order.subscriptionId !== undefined ? { subscriptionId: order.subscriptionId } : {}),
        ...(providerRefundId !== undefined ? { providerRefundId } : {}),
        ...(isSettledOnCreate ? { settledAt: now } : {}),
        ...(parsed.data.metadata !== undefined ? { metadata: parsed.data.metadata } : {}),
      };

      // Apply the refund to the order FIRST: recordRefund is the authoritative
      // over-refund guard, so persisting the refund row only after it succeeds
      // keeps the system fail-closed (no orphan refund that lets a double-refund).
      const recordResult = await options.orders.recordRefund({
        orderId: parsed.data.orderId,
        amount,
      });

      if (Result.isError(recordResult)) {
        return Result.err(recordResult.error);
      }

      const refundResult = await options.database.refunds.create(refund);

      if (Result.isError(refundResult)) {
        return Result.err(refundResult.error);
      }

      const created = refundResult.value;

      await emitRefundEvent(runtime, {
        type: "billing.refund.created",
        payload: created,
      });

      // If the provider settled the refund synchronously on create, also announce
      // the terminal status so consumers do not have to special-case it.
      if (isTerminalStatus(created.status)) {
        await emitRefundEvent(runtime, {
          type: transitionEventType[created.status],
          payload: created,
        });
      }

      return refundResult;
    },
    transition: async (input: RefundTransitionInput) => {
      const parsed = refundTransitionInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const currentResult = await options.database.refunds.findById(parsed.data.id);

      if (Result.isError(currentResult)) {
        return Result.err(currentResult.error);
      }

      if (currentResult.value === null) {
        return notFound("Reembolso não encontrado.");
      }

      const current = currentResult.value;

      if (isTerminalStatus(current.status)) {
        return invalidState(
          `O reembolso já está em estado final "${current.status}" e não pode transicionar para "${parsed.data.status}".`,
        );
      }

      const now = new Date().toISOString();
      const next: Refund = {
        ...current,
        status: parsed.data.status,
        settledAt: now,
        updatedAt: now,
        ...(parsed.data.providerRefundId !== undefined
          ? { providerRefundId: parsed.data.providerRefundId }
          : {}),
        ...(parsed.data.metadata !== undefined
          ? { metadata: { ...(current.metadata ?? {}), ...parsed.data.metadata } }
          : {}),
      };

      const updateResult = await options.database.refunds.update(next);

      if (Result.isError(updateResult)) {
        return Result.err(updateResult.error);
      }

      const settled = updateResult.value;

      await emitRefundEvent(runtime, {
        type: transitionEventType[parsed.data.status],
        payload: settled,
      });

      return updateResult;
    },
    get: async (id: string) => options.database.refunds.findById(id),
    listByOrder: async (orderId: string) => options.database.refunds.listByOrder(orderId),
    listByCustomer: async (customerId: string) =>
      options.database.refunds.list({ customerId }),
    listBySubscription: async (subscriptionId: string) =>
      options.database.refunds.list({ subscriptionId }),
    list: async (filter: RefundListFilter) => {
      const parsed = refundListFilterSchema.safeParse(filter);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      return options.database.refunds.list(parsed.data);
    },
  }),
});

export type {
  BillingResult,
  RefundsDatabaseAdapter,
  RefundsLookupAdapter,
  RefundsProviderAdapter,
};
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export {
  refundInputSchema,
  refundListFilterSchema,
  refundReasonSchema,
  refundSchema,
  refundStatusSchema,
  refundTerminalStatuses,
  refundTransitionInputSchema,
};
export type {
  Refund,
  RefundInput,
  RefundListFilter,
  RefundStatus,
  RefundTerminalStatus,
  RefundTransitionInput,
};
export { currencySchema, metadataSchema };
