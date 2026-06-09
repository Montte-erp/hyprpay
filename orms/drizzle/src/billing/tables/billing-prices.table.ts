import { boolean, integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { Price } from "../../billing-plugin"

const billing = pgSchema("billing");

export const billingPrices = billing.table("prices", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  slug: text("slug").notNull().unique(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  interval: text("interval").notNull(),
  trialDays: integer("trial_days"),
  usageBased: boolean("usage_based").notNull().default(false),
  billingStrategy: text("billing_strategy"),
  // Defect 2 (PWYW / custom pricing). priceType is a plain text() enum column
  // (see drizzle-zod-text-columns memo); literal type restored on read.
  priceType: text("price_type").notNull().default("fixed"),
  minAmount: integer("min_amount"),
  presetAmount: integer("preset_amount"),
  // Defect 3 (metered pricing binding).
  meterId: text("meter_id"),
  unitAmount: integer("unit_amount"),
  providerProductId: text("provider_product_id"),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
