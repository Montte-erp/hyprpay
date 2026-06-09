import { boolean, integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { Subscription } from "../../billing-plugin"

const billing = pgSchema("billing");

export const billingSubscriptions = billing.table("subscriptions", {
  id: text("id").primaryKey(),
  providerSubscriptionId: text("provider_subscription_id"),
  customerId: text("customer_id").notNull(),
  priceId: text("price_id").notNull(),
  paymentMethod: text("payment_method").notNull(),
  providerProductId: text("provider_product_id"),
  trialDays: integer("trial_days"),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  status: text("status").notNull(),
  currentPeriodStart: text("current_period_start"),
  currentPeriodEnd: text("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: text("canceled_at"),
  endedAt: text("ended_at"),
  trialEndsAt: text("trial_ends_at"),
  // Dunning: failed-renewal retry counter and last PSP error message.
  dunningRetryCount: integer("dunning_retry_count").notNull().default(0),
  lastPaymentError: text("last_payment_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
