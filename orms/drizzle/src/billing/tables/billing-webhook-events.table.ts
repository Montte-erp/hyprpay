import { jsonb, pgSchema, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { BillingEvent } from "../../billing-plugin"

const billing = pgSchema("billing");

export const billingWebhookEvents = billing.table(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    customerId: text("customer_id"),
    chargeId: text("charge_id"),
    subscriptionId: text("subscription_id"),
    occurredAt: text("occurred_at").notNull(),
    payload: jsonb("payload").$type<BillingEvent["payload"]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    providerExternalIdIndex: uniqueIndex("billing_webhook_events_provider_external_id_idx").on(
      table.provider,
      table.externalId,
    ),
  }),
);
