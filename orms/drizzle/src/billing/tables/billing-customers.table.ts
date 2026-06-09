import { jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { BillingAddress, Customer } from "../../billing-plugin"

const billing = pgSchema("billing");

export const billingCustomers = billing.table("customers", {
  id: text("id").primaryKey(),
  providerCustomerId: text("provider_customer_id"),
  externalId: text("external_id").unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  document: text("document").notNull(),
  documentType: text("document_type").notNull(),
  phone: text("phone"),
  taxId: text("tax_id"),
  billingAddress: jsonb("billing_address").$type<BillingAddress>(),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Soft-delete marker (ISO string), mirroring the text timestamp pattern.
  deletedAt: text("deleted_at"),
});
