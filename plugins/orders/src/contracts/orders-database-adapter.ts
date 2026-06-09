import type { BillingResult } from "../results/billing-result";
import type { Invoice } from "../schemas/invoice-schema";
import type { Order } from "../schemas/order-schema";

export interface OrdersListFilter {
  customerId?: string;
  subscriptionId?: string;
}

export interface InvoicesListFilter {
  orderId?: string;
  customerId?: string;
}

export interface OrdersDatabaseAdapter {
  orders: {
    create(input: Order): Promise<BillingResult<Order>>;
    findById(id: string): Promise<BillingResult<Order | null>>;
    update(input: Order): Promise<BillingResult<Order>>;
    list(filter: OrdersListFilter): Promise<BillingResult<Order[]>>;
  };
  invoices: {
    create(input: Invoice): Promise<BillingResult<Invoice>>;
    findById(id: string): Promise<BillingResult<Invoice | null>>;
    update(input: Invoice): Promise<BillingResult<Invoice>>;
    list(filter: InvoicesListFilter): Promise<BillingResult<Invoice[]>>;
    // Reserve and return the next monotonic invoice number for the namespace.
    // Implementations MUST make this atomic so two concurrent issues never
    // receive the same number. The returned value is the raw integer sequence;
    // the plugin formats it into the human-facing invoice number string.
    nextInvoiceNumber(): Promise<BillingResult<number>>;
  };
}

export type OrdersLookupAdapter = Pick<OrdersDatabaseAdapter, "orders">;
export type InvoicesLookupAdapter = Pick<OrdersDatabaseAdapter, "invoices">;
