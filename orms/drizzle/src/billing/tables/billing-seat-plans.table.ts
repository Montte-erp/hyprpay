import { integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

const billing = pgSchema("billing");

export const billingSeatPlans = billing.table("seat_plans", {
  id: text("id").primaryKey(),
  priceId: text("price_id").notNull(),
  includedSeats: integer("included_seats").notNull().default(0),
  perSeatAmount: integer("per_seat_amount").notNull(),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
