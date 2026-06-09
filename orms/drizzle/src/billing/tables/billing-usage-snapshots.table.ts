import { doublePrecision, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

const billing = pgSchema("billing");

export const billingUsageSnapshots = billing.table("usage_snapshots", {
  id: text("id").primaryKey(),
  meterId: text("meter_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  aggregatedValue: doublePrecision("aggregated_value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
