import { integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

const billing = pgSchema("billing");

export const billingEntitlements = billing.table("entitlements", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  feature: text("feature").notNull(),
  limit: integer("limit"),
  used: integer("used").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
