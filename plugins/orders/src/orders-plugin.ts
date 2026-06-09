import { Result } from "better-result";
import { multiplyQuantity, sumAmounts } from "@hyprpay/money";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import type {
  InvoicesListFilter,
  InvoicesLookupAdapter,
  OrdersDatabaseAdapter,
  OrdersListFilter,
  OrdersLookupAdapter,
} from "./contracts/orders-database-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type {
  Invoice,
  InvoiceInput,
  InvoiceStatus,
} from "./schemas/invoice-schema";
import {
  invoiceInputSchema,
  invoiceSchema,
  invoiceStatusSchema,
} from "./schemas/invoice-schema";
import type {
  BillingReason,
  Order,
  OrderBillingUpdateInput,
  OrderInput,
  OrderLine,
  OrderStatus,
} from "./schemas/order-schema";
import {
  billingReasonSchema,
  orderBillingUpdateInputSchema,
  orderInputSchema,
  orderLineInputSchema,
  orderLineSchema,
  orderLineTypeSchema,
  orderSchema,
  orderStatusSchema,
} from "./schemas/order-schema";
import type { BillingAddress } from "./schemas/shared-schema";
import { billingAddressSchema, currencySchema, metadataSchema } from "./schemas/shared-schema";

export interface OrdersApi {
  create(input: OrderInput): Promise<BillingResult<Order>>;
  get(id: string): Promise<BillingResult<Order | null>>;
  list(filter: OrdersListFilter): Promise<BillingResult<Order[]>>;
  update(input: {
    orderId: string;
    billing: OrderBillingUpdateInput;
  }): Promise<BillingResult<Order>>;
  markPaid(id: string): Promise<BillingResult<Order>>;
  recordRefund(input: { orderId: string; amount: number }): Promise<BillingResult<Order>>;
  draftInvoice(input: InvoiceInput): Promise<BillingResult<Invoice>>;
  issueInvoice(invoiceId: string): Promise<BillingResult<Invoice>>;
  getInvoice(id: string): Promise<BillingResult<Invoice | null>>;
  listInvoices(filter: InvoicesListFilter): Promise<BillingResult<Invoice[]>>;
}

export interface OrdersPluginOptions {
  database: OrdersDatabaseAdapter;
}

export interface OrdersRefundPort {
  recordRefund(input: { orderId: string; amount: number }): Promise<BillingResult<Order>>;
  get(id: string): Promise<BillingResult<Order | null>>;
}

export type OrderPluginEvent =
  | { type: "billing.order.created"; payload: Order }
  | { type: "billing.order.paid"; payload: Order }
  | { type: "billing.order.refunded"; payload: Order };

export type InvoicePluginEvent =
  | { type: "billing.invoice.created"; payload: Invoice }
  | { type: "billing.invoice.issued"; payload: Invoice };

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

// net_amount is always derived from the canonical totals, never trusted from input.
const computeNetAmount = (totalAmount: number, amountRefunded: number): number =>
  Math.max(0, totalAmount - amountRefunded);

const emitOrderEvent = async (runtime: HyprPayRuntime, event: OrderPluginEvent) => {
  await runtime.emit(event);
};

const emitInvoiceEvent = async (runtime: HyprPayRuntime, event: InvoicePluginEvent) => {
  await runtime.emit(event);
};

// Format a raw monotonic sequence into a stable, sortable invoice number string.
const formatInvoiceNumber = (sequence: number): string =>
  `INV-${String(sequence).padStart(6, "0")}`;

export const orders = (
  options: OrdersPluginOptions,
): HyprPayPlugin<"orders", OrdersApi> => ({
  id: "orders",
  namespace: "orders",
  extendApi: runtime => ({
    create: async (input: OrderInput) => {
      const parsed = orderInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const items: OrderLine[] = parsed.data.items.map(line => ({
        id: crypto.randomUUID(),
        label: line.label,
        type: line.type,
        quantity: line.quantity,
        unitAmount: line.unitAmount,
        amount: multiplyQuantity(line.unitAmount, line.quantity),
        ...(line.priceId !== undefined ? { priceId: line.priceId } : {}),
      }));

      const subtotalAmount = sumAmounts(...items.map(line => line.amount));
      const totalAmount = Math.max(
        0,
        subtotalAmount - parsed.data.discountAmount + parsed.data.taxAmount,
      );

      const order: Order = {
        id: crypto.randomUUID(),
        customerId: parsed.data.customerId,
        status: "pending",
        billingReason: parsed.data.billingReason,
        currency: parsed.data.currency,
        items,
        subtotalAmount,
        discountAmount: parsed.data.discountAmount,
        taxAmount: parsed.data.taxAmount,
        totalAmount,
        amountRefunded: 0,
        netAmount: computeNetAmount(totalAmount, 0),
        createdAt: new Date().toISOString(),
        ...(parsed.data.billingName !== undefined ? { billingName: parsed.data.billingName } : {}),
        ...(parsed.data.billingAddress !== undefined
          ? { billingAddress: parsed.data.billingAddress }
          : {}),
        ...(parsed.data.checkoutId !== undefined ? { checkoutId: parsed.data.checkoutId } : {}),
        ...(parsed.data.subscriptionId !== undefined
          ? { subscriptionId: parsed.data.subscriptionId }
          : {}),
        ...(parsed.data.metadata !== undefined ? { metadata: parsed.data.metadata } : {}),
      };

      const createdResult = await options.database.orders.create(order);

      if (Result.isError(createdResult)) {
        return Result.err(createdResult.error);
      }

      await emitOrderEvent(runtime, {
        type: "billing.order.created",
        payload: createdResult.value,
      });

      return createdResult;
    },
    get: async (id: string) => options.database.orders.findById(id),
    list: async (filter: OrdersListFilter) => {
      const normalizedFilter: OrdersListFilter = {
        ...(filter.customerId !== undefined ? { customerId: filter.customerId } : {}),
        ...(filter.subscriptionId !== undefined
          ? { subscriptionId: filter.subscriptionId }
          : {}),
      };

      return options.database.orders.list(normalizedFilter);
    },
    update: async (input: { orderId: string; billing: OrderBillingUpdateInput }) => {
      const parsed = orderBillingUpdateInputSchema.safeParse(input.billing);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const existingResult = await options.database.orders.findById(input.orderId);

      if (Result.isError(existingResult)) {
        return Result.err(existingResult.error);
      }

      if (existingResult.value === null) {
        return notFound("Pedido de billing não encontrado.");
      }

      const order = existingResult.value;

      // Billing identity may only be corrected while the order is still open.
      // Once paid/refunded/canceled the identity is frozen for fiscal integrity.
      if (order.status !== "pending") {
        return invalidBillingInput(
          "Identidade de billing só pode ser alterada enquanto o pedido está pendente.",
        );
      }

      const nextMetadata =
        parsed.data.metadata !== undefined
          ? { ...(order.metadata ?? {}), ...parsed.data.metadata }
          : order.metadata;

      const updatedOrder: Order = {
        ...order,
        ...(parsed.data.billingName !== undefined ? { billingName: parsed.data.billingName } : {}),
        ...(parsed.data.billingAddress !== undefined
          ? { billingAddress: parsed.data.billingAddress }
          : {}),
        ...(nextMetadata !== undefined ? { metadata: nextMetadata } : {}),
      };

      return options.database.orders.update(updatedOrder);
    },
    markPaid: async (id: string) => {
      const existingResult = await options.database.orders.findById(id);

      if (Result.isError(existingResult)) {
        return Result.err(existingResult.error);
      }

      if (existingResult.value === null) {
        return notFound("Pedido de billing não encontrado.");
      }

      const paidOrder: Order = {
        ...existingResult.value,
        status: "paid",
        netAmount: computeNetAmount(
          existingResult.value.totalAmount,
          existingResult.value.amountRefunded,
        ),
      };

      const updatedResult = await options.database.orders.update(paidOrder);

      if (Result.isError(updatedResult)) {
        return Result.err(updatedResult.error);
      }

      await emitOrderEvent(runtime, {
        type: "billing.order.paid",
        payload: updatedResult.value,
      });

      return updatedResult;
    },
    recordRefund: async (input: { orderId: string; amount: number }) => {
      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        return invalidBillingInput("Valor de estorno inválido.");
      }

      const existingResult = await options.database.orders.findById(input.orderId);

      if (Result.isError(existingResult)) {
        return Result.err(existingResult.error);
      }

      if (existingResult.value === null) {
        return notFound("Pedido de billing não encontrado.");
      }

      const order = existingResult.value;
      const nextAmountRefunded = order.amountRefunded + input.amount;

      if (nextAmountRefunded > order.totalAmount) {
        return invalidBillingInput("Valor de estorno excede o total do pedido.");
      }

      const nextStatus: OrderStatus =
        nextAmountRefunded >= order.totalAmount ? "refunded" : "partially_refunded";

      const refundedOrder: Order = {
        ...order,
        amountRefunded: nextAmountRefunded,
        netAmount: computeNetAmount(order.totalAmount, nextAmountRefunded),
        status: nextStatus,
      };

      const updatedResult = await options.database.orders.update(refundedOrder);

      if (Result.isError(updatedResult)) {
        return Result.err(updatedResult.error);
      }

      await emitOrderEvent(runtime, {
        type: "billing.order.refunded",
        payload: updatedResult.value,
      });

      return updatedResult;
    },
    draftInvoice: async (input: InvoiceInput) => {
      const parsed = invoiceInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const orderResult = await options.database.orders.findById(parsed.data.orderId);

      if (Result.isError(orderResult)) {
        return Result.err(orderResult.error);
      }

      if (orderResult.value === null) {
        return notFound("Pedido de billing não encontrado.");
      }

      const order = orderResult.value;

      const invoice: Invoice = {
        id: crypto.randomUUID(),
        orderId: order.id,
        customerId: order.customerId,
        status: "draft",
        currency: order.currency,
        // Snapshot the net payable (total minus any refunds already recorded).
        amount: order.netAmount,
        createdAt: new Date().toISOString(),
        ...(order.billingName !== undefined ? { billingName: order.billingName } : {}),
        ...(order.billingAddress !== undefined ? { billingAddress: order.billingAddress } : {}),
        ...(parsed.data.metadata !== undefined ? { metadata: parsed.data.metadata } : {}),
      };

      const createdResult = await options.database.invoices.create(invoice);

      if (Result.isError(createdResult)) {
        return Result.err(createdResult.error);
      }

      await emitInvoiceEvent(runtime, {
        type: "billing.invoice.created",
        payload: createdResult.value,
      });

      return createdResult;
    },
    issueInvoice: async (invoiceId: string) => {
      const existingResult = await options.database.invoices.findById(invoiceId);

      if (Result.isError(existingResult)) {
        return Result.err(existingResult.error);
      }

      if (existingResult.value === null) {
        return notFound("Fatura de billing não encontrada.");
      }

      const invoice = existingResult.value;

      // Issuing is idempotent in spirit but a one-way transition: an already
      // issued invoice keeps its number and is rejected for re-issue.
      if (invoice.status !== "draft") {
        return invalidBillingInput("Apenas faturas em rascunho podem ser emitidas.");
      }

      const sequenceResult = await options.database.invoices.nextInvoiceNumber();

      if (Result.isError(sequenceResult)) {
        return Result.err(sequenceResult.error);
      }

      const issuedInvoice: Invoice = {
        ...invoice,
        status: "issued",
        invoiceNumber: formatInvoiceNumber(sequenceResult.value),
        issuedAt: new Date().toISOString(),
      };

      const updatedResult = await options.database.invoices.update(issuedInvoice);

      if (Result.isError(updatedResult)) {
        return Result.err(updatedResult.error);
      }

      await emitInvoiceEvent(runtime, {
        type: "billing.invoice.issued",
        payload: updatedResult.value,
      });

      return updatedResult;
    },
    getInvoice: async (id: string) => options.database.invoices.findById(id),
    listInvoices: async (filter: InvoicesListFilter) => {
      const normalizedFilter: InvoicesListFilter = {
        ...(filter.orderId !== undefined ? { orderId: filter.orderId } : {}),
        ...(filter.customerId !== undefined ? { customerId: filter.customerId } : {}),
      };

      return options.database.invoices.list(normalizedFilter);
    },
  }),
});

export type {
  BillingAddress,
  BillingResult,
  InvoicesListFilter,
  InvoicesLookupAdapter,
  OrdersDatabaseAdapter,
  OrdersListFilter,
  OrdersLookupAdapter,
};
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export {
  billingReasonSchema,
  orderBillingUpdateInputSchema,
  orderInputSchema,
  orderLineInputSchema,
  orderLineSchema,
  orderLineTypeSchema,
  orderSchema,
  orderStatusSchema,
};
export { invoiceInputSchema, invoiceSchema, invoiceStatusSchema };
export type {
  BillingReason,
  Order,
  OrderBillingUpdateInput,
  OrderInput,
  OrderLine,
  OrderStatus,
};
export type { Invoice, InvoiceInput, InvoiceStatus };
export { billingAddressSchema, currencySchema, metadataSchema };
