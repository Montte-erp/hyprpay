import { integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

const billing = pgSchema("billing");

export const billingSeatChargeLines = billing.table("seat_charge_lines", {
  id: text("id").primaryKey(),
  subscriptionId: text("subscription_id").notNull(),
  planId: text("plan_id").notNull(),
  label: text("label").notNull(),
  currency: text("currency").notNull(),
  seats: integer("seats").notNull(),
  billableSeats: integer("billable_seats").notNull(),
  unitAmount: integer("unit_amount").notNull(),
  amount: integer("amount").notNull(),
  proratedFromSeats: integer("prorated_from_seats"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
