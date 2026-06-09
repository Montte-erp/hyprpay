import { boolean, integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { Discount } from "../../discounts-plugin";

const billing = pgSchema("billing");

export const billingDiscounts = billing.table("discounts", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull(),
  value: integer("value").notNull(),
  currency: text("currency").notNull(),
  duration: text("duration").notNull().default("once"),
  durationInCycles: integer("duration_in_cycles"),
  maxRedemptions: integer("max_redemptions"),
  active: boolean("active").notNull().default(true),
  timesRedeemed: integer("times_redeemed").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
