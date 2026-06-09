import { doublePrecision, pgSchema, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const billing = pgSchema("billing");

export const billingMeterCredits = billing.table(
  "meter_credits",
  {
    id: text("id").primaryKey(),
    meterId: text("meter_id").notNull(),
    customerId: text("customer_id").notNull(),
    granted: doublePrecision("granted").notNull().default(0),
    consumed: doublePrecision("consumed").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    meterCustomerIndex: uniqueIndex("billing_meter_credits_meter_customer_idx").on(
      table.meterId,
      table.customerId,
    ),
  }),
);
