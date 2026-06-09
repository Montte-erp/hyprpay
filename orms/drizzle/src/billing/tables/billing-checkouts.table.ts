import { integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { Checkout } from "../../billing-plugin"

const billing = pgSchema("billing");

export const billingCheckouts = billing.table("checkouts", {
  id: text("id").primaryKey(),
  providerCheckoutId: text("provider_checkout_id"),
  customerId: text("customer_id").notNull(),
  subscriptionId: text("subscription_id"),
  priceId: text("price_id").notNull(),
  providerProductId: text("provider_product_id"),
  methods: jsonb("methods").$type<Checkout["methods"]>().notNull(),
  successUrl: text("success_url"),
  cancelUrl: text("cancel_url"),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  url: text("url").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
