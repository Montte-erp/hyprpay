import { integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { BillingAddress } from "../../orders-plugin";

const billing = pgSchema("billing");

export const billingInvoices = billing.table("invoices", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number"),
  orderId: text("order_id").notNull(),
  customerId: text("customer_id").notNull(),
  status: text("status").notNull(),
  currency: text("currency").notNull(),
  amount: integer("amount").notNull(),
  billingName: text("billing_name"),
  billingAddress: jsonb("billing_address").$type<BillingAddress>(),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  issuedAt: text("issued_at"),
});
