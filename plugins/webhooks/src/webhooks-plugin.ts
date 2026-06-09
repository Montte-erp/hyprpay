import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import type { ChargeLookupAdapter, ChargePluginEvent } from "@hyprpay/charges";
import type { CheckoutLookupAdapter, CheckoutPluginEvent } from "@hyprpay/checkouts";
import type { Order, OrdersLookupAdapter } from "@hyprpay/orders";
import type { SubscriptionLookupAdapter } from "@hyprpay/subscriptions";
import type { WebhooksDatabaseAdapter } from "./contracts/webhooks-database-adapter";
import type { WebhooksProviderAdapter } from "./contracts/webhooks-provider-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import {
  billingEventSchema,
  billingEventTypeSchema,
  type BillingEvent,
  type BillingEventType,
} from "./schemas/billing-event-schema";

export interface WebhooksApi {
  handle(request: Request): Promise<BillingResult<BillingEvent>>;
}

export interface WebhooksPluginOptions {
  database: WebhooksDatabaseAdapter;
  provider: WebhooksProviderAdapter;
  charges?: ChargeLookupAdapter;
  checkouts?: CheckoutLookupAdapter;
  subscriptions?: SubscriptionLookupAdapter;
  orders?: OrdersLookupAdapter;
  webhookPath?: string;
}

export type WebhookPluginEvent =
  | ChargePluginEvent
  | CheckoutPluginEvent
  | { type: "billing.webhook.received"; payload: BillingEvent };

const invalidBillingInput = <T>(message = "Dados de billing inválidos."): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.INVALID_INPUT(),
      message,
    }),
  );

const emitWebhookEvent = async (runtime: HyprPayRuntime, event: WebhookPluginEvent) => {
  await runtime.emit(event);
};

// Decoupled order emission: webhooks stays additive and does not widen its own
// WebhookPluginEvent union (the order arm lives in @hyprpay/orders' OrderPluginEvent).
const emitOrderPaidEvent = async (runtime: HyprPayRuntime, order: Order) => {
  await runtime.emit({ type: "billing.order.paid", payload: order });
};

const errorStatus = (error: BillingError) => error.status ?? error.error.status;

// The BillingEvent schema has no dedicated `orderId` field, so we derive an order
// id best-effort from the untyped `payload` (provider metadata `order_id`). This is
// purely additive and guarded; if no usable id is present we skip the orders lookup.
// TODO: promote `orderId` to a first-class BillingEvent field once the schema is
// allowed to change (out of scope for §11 — must not break BillingEvent schema).
const deriveOrderId = (event: BillingEvent): string | undefined => {
  const payload = event.payload;

  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const directId = record.order_id;

  if (typeof directId === "string" && directId.length > 0) {
    return directId;
  }

  const metadata = record.metadata;

  if (typeof metadata === "object" && metadata !== null) {
    const metadataId = (metadata as Record<string, unknown>).order_id;

    if (typeof metadataId === "string" && metadataId.length > 0) {
      return metadataId;
    }
  }

  return undefined;
};

export const billingResultToResponse = async (
  result: Promise<BillingResult<unknown>> | BillingResult<unknown>,
) => {
  const resolvedResult = await result;

  if (Result.isError(resolvedResult)) {
    return Response.json(
      {
        success: false,
        error: resolvedResult.error.message,
      },
      { status: errorStatus(resolvedResult.error) },
    );
  }

  return Response.json({
    success: true,
    data: resolvedResult.value,
  });
};

const createWebhooksApi = (options: WebhooksPluginOptions, runtime: HyprPayRuntime): WebhooksApi => ({
  handle: async request => {
    if (options.provider.verifyWebhook !== undefined) {
      const verificationResult = await options.provider.verifyWebhook(request.clone());

      if (Result.isError(verificationResult)) {
        return Result.err(verificationResult.error);
      }
    }

    const eventResult = await options.provider.parseWebhook(request);

    if (Result.isError(eventResult)) {
      return Result.err(eventResult.error);
    }

    const normalizedResult = billingEventSchema.safeParse(eventResult.value);

    if (!normalizedResult.success) {
      return invalidBillingInput("Evento de billing inválido.");
    }

    const externalId = normalizedResult.data.externalId ?? normalizedResult.data.id;
    const processedResult = await options.database.events.hasProcessed(
      normalizedResult.data.provider,
      externalId,
    );

    if (Result.isError(processedResult)) {
      return Result.err(processedResult.error);
    }

    if (!processedResult.value) {
      const appendResult = await options.database.events.append({
        ...normalizedResult.data,
        externalId,
      });

      if (Result.isError(appendResult)) {
        return Result.err(appendResult.error);
      }
    }

    if (normalizedResult.data.chargeId !== undefined && options.charges !== undefined) {
      const chargeResult = await options.charges.charges.findById(normalizedResult.data.chargeId);

      if (
        !Result.isError(chargeResult) &&
        chargeResult.value !== null &&
        normalizedResult.data.type === "payment.paid"
      ) {
        await emitWebhookEvent(runtime, {
          type: "billing.charge.paid",
          payload: chargeResult.value,
        });
      }
    }

    const checkoutId = normalizedResult.data.type === "checkout.completed"
      ? normalizedResult.data.id
      : undefined;

    if (checkoutId !== undefined && options.checkouts !== undefined) {
      const checkoutResult = await options.checkouts.checkouts.findById(checkoutId);

      if (!Result.isError(checkoutResult) && checkoutResult.value !== null) {
        await emitWebhookEvent(runtime, {
          type: "billing.checkout.completed",
          payload: checkoutResult.value,
        });
      }
    }

    const resolvesToPaid =
      normalizedResult.data.type === "payment.paid" ||
      normalizedResult.data.type === "checkout.completed";

    if (resolvesToPaid && options.orders !== undefined) {
      const orderId = deriveOrderId(normalizedResult.data);

      if (orderId !== undefined) {
        const orderResult = await options.orders.orders.findById(orderId);

        if (!Result.isError(orderResult) && orderResult.value !== null) {
          await emitOrderPaidEvent(runtime, orderResult.value);
        }
      }
    }

    await emitWebhookEvent(runtime, {
      type: "billing.webhook.received",
      payload: normalizedResult.data,
    });

    return Result.ok(normalizedResult.data);
  },
});

export const webhooks = (options: WebhooksPluginOptions): HyprPayPlugin<"webhooks", WebhooksApi> => {
  let api: WebhooksApi | undefined;

  return {
    id: "webhooks",
    namespace: "webhooks",
    extendApi: runtime => {
      const webhooksApi = createWebhooksApi(options, runtime);
      api = webhooksApi;
      return webhooksApi;
    },
    routes: [
      {
        method: "POST",
        path: options.webhookPath ?? "/webhooks",
        handler: async (request, runtime) => {
          const webhooksApi = api ?? createWebhooksApi(options, runtime);
          api = webhooksApi;
          return billingResultToResponse(webhooksApi.handle(request));
        },
      },
    ],
  };
};

export type {
  BillingResult,
  BillingEvent,
  BillingEventType,
  WebhooksDatabaseAdapter,
  WebhooksProviderAdapter,
};
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export { billingEventSchema, billingEventTypeSchema };
