import { integer, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { Charge } from "../../billing-plugin"

const billing = pgSchema("billing");

export const billingCharges = billing.table("charges", {
  id: text("id").primaryKey(),
  providerChargeId: text("provider_charge_id"),
  customerId: text("customer_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  method: text("method").notNull(),
  status: text("status").notNull(),
  description: text("description"),
  receiptUrl: text("receipt_url"),
  boleto: jsonb("boleto").$type<Charge["boleto"] | null>().default(null),
  card: jsonb("card").$type<Charge["card"] | null>().default(null),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  pix: jsonb("pix").$type<Charge["pix"] | null>().default(null),
  boletoDetails: jsonb("boleto_details").$type<Charge["boletoDetails"] | null>().default(null),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
