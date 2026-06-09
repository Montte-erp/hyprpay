import { integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { Order } from "../../orders-plugin";

const billing = pgSchema("billing");

export const billingOrders = billing.table("orders", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  status: text("status").notNull(),
  billingReason: text("billing_reason").notNull(),
  currency: text("currency").notNull(),
  subtotalAmount: integer("subtotal_amount").notNull(),
  discountAmount: integer("discount_amount").notNull().default(0),
  taxAmount: integer("tax_amount").notNull().default(0),
  totalAmount: integer("total_amount").notNull(),
  amountRefunded: integer("amount_refunded").notNull().default(0),
  checkoutId: text("checkout_id"),
  subscriptionId: text("subscription_id"),
  providerOrderId: text("provider_order_id"),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
