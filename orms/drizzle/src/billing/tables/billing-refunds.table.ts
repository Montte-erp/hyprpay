import { integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { Refund } from "../../refunds-plugin";
import { billingOrders } from "./billing-orders.table";

const billing = pgSchema("billing");

export const billingRefunds = billing.table("refunds", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => billingOrders.id),
  // Denormalized from the order so refunds can be listed by customer/subscription.
  customerId: text("customer_id"),
  subscriptionId: text("subscription_id"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  providerRefundId: text("provider_refund_id"),
  // ISO timestamp of the last settled transition (succeeded/failed/canceled).
  settledAt: text("settled_at"),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: text("updated_at"),
});
