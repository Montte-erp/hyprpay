import { boolean, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { Meter } from "../../meters-plugin";

const billing = pgSchema("billing");

export const billingMeters = billing.table("meters", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  eventName: text("event_name").notNull(),
  aggregation: text("aggregation").notNull().default("sum"),
  valueProperty: text("value_property"),
  active: boolean("active").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
