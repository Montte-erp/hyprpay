import { doublePrecision, jsonb, pgSchema, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const billing = pgSchema("billing");

export const billingMeterEvents = billing.table(
  "meter_events",
  {
    id: text("id").primaryKey(),
    meterId: text("meter_id").notNull(),
    customerId: text("customer_id").notNull(),
    subscriptionId: text("subscription_id"),
    value: doublePrecision("value").notNull().default(1),
    timestamp: text("timestamp").notNull(),
    idempotencyKey: text("idempotency_key"),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    idempotencyKeyIndex: uniqueIndex("billing_meter_events_idempotency_key_idx").on(
      table.idempotencyKey,
    ),
  }),
);
