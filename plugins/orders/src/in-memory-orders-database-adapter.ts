import { Result } from "better-result";
import type {
  InvoicesListFilter,
  OrdersDatabaseAdapter,
  OrdersListFilter,
} from "./contracts/orders-database-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type { Invoice } from "./schemas/invoice-schema";
import type { Order } from "./schemas/order-schema";

const databaseFailure = <T>(message: string): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.DATABASE_REQUEST_FAILED(),
      message,
    }),
  );

// Reference in-memory adapter used by the orders plugin test suite. It mirrors
// the persistence contract exactly, including the atomic invoice-number
// sequence, so tests exercise the same code paths a real Drizzle adapter would.
export const createInMemoryOrdersDatabaseAdapter = (): OrdersDatabaseAdapter => {
  const orderStore = new Map<string, Order>();
  const invoiceStore = new Map<string, Invoice>();
  let invoiceSequence = 0;

  return {
    orders: {
      create: async (input: Order) => {
        if (orderStore.has(input.id)) {
          return databaseFailure("Pedido de billing já existe.");
        }

        orderStore.set(input.id, input);

        return Result.ok(input);
      },
      findById: async (id: string) => Result.ok(orderStore.get(id) ?? null),
      update: async (input: Order) => {
        if (!orderStore.has(input.id)) {
          return databaseFailure("Pedido de billing não encontrado.");
        }

        orderStore.set(input.id, input);

        return Result.ok(input);
      },
      list: async (filter: OrdersListFilter) => {
        const matches = [...orderStore.values()].filter(order => {
          if (filter.customerId !== undefined && order.customerId !== filter.customerId) {
            return false;
          }

          if (
            filter.subscriptionId !== undefined &&
            order.subscriptionId !== filter.subscriptionId
          ) {
            return false;
          }

          return true;
        });

        return Result.ok(matches);
      },
    },
    invoices: {
      create: async (input: Invoice) => {
        if (invoiceStore.has(input.id)) {
          return databaseFailure("Fatura de billing já existe.");
        }

        invoiceStore.set(input.id, input);

        return Result.ok(input);
      },
      findById: async (id: string) => Result.ok(invoiceStore.get(id) ?? null),
      update: async (input: Invoice) => {
        if (!invoiceStore.has(input.id)) {
          return databaseFailure("Fatura de billing não encontrada.");
        }

        invoiceStore.set(input.id, input);

        return Result.ok(input);
      },
      list: async (filter: InvoicesListFilter) => {
        const matches = [...invoiceStore.values()].filter(invoice => {
          if (filter.orderId !== undefined && invoice.orderId !== filter.orderId) {
            return false;
          }

          if (filter.customerId !== undefined && invoice.customerId !== filter.customerId) {
            return false;
          }

          return true;
        });

        return Result.ok(matches);
      },
      nextInvoiceNumber: async () => {
        invoiceSequence += 1;

        return Result.ok(invoiceSequence);
      },
    },
  };
};
