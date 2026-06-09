import { boolean, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

const billing = pgSchema("billing");

export const billingProducts = billing.table("products", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
