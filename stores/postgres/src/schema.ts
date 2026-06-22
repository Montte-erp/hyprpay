import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

const recordColumns = {
  id: text("id").primaryKey().notNull(),
  data: jsonb("data").notNull(),
};

export const customersTable = pgTable("hyprpay_customers", recordColumns);
export const checkoutsTable = pgTable("hyprpay_checkouts", recordColumns);
export const ordersTable = pgTable("hyprpay_orders", recordColumns);
export const subscriptionsTable = pgTable("hyprpay_subscriptions", recordColumns);
export const refundsTable = pgTable("hyprpay_refunds", recordColumns);
export const eventsTable = pgTable("hyprpay_events", recordColumns);
export const benefitGrantsTable = pgTable("hyprpay_benefit_grants", recordColumns);
export const usageRecordsTable = pgTable("hyprpay_usage_records", recordColumns);
export const licenseKeysTable = pgTable("hyprpay_license_keys", recordColumns);
export const licenseKeyActivationsTable = pgTable("hyprpay_license_key_activations", recordColumns);
export const seatsTable = pgTable("hyprpay_seats", recordColumns);
export const portalSessionsTable = pgTable("hyprpay_portal_sessions", recordColumns);
export const catalogVersionsTable = pgTable("hyprpay_catalog_versions", recordColumns);

export const hyprPayPostgresSchema = {
  customersTable,
  checkoutsTable,
  ordersTable,
  subscriptionsTable,
  refundsTable,
  eventsTable,
  benefitGrantsTable,
  usageRecordsTable,
  licenseKeysTable,
  licenseKeyActivationsTable,
  seatsTable,
  portalSessionsTable,
  catalogVersionsTable,
};
