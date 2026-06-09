import { integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { OrderLine } from "../../orders-plugin";
import { billingOrders } from "./billing-orders.table";

const billing = pgSchema("billing");

export const billingOrderLines = billing.table("order_lines", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => billingOrders.id),
  label: text("label").notNull(),
  priceId: text("price_id"),
  type: text("type").notNull().default("product"),
  quantity: integer("quantity").notNull().default(1),
  unitAmount: integer("unit_amount").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
