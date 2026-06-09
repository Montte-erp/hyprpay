import type { CatalogDatabaseAdapter } from "@hyprpay/catalog";
import type { ChargesDatabaseAdapter } from "@hyprpay/charges";
import type { CheckoutsDatabaseAdapter } from "@hyprpay/checkouts";
import type { CustomersDatabaseAdapter } from "@hyprpay/customers";
import type { DiscountsDatabaseAdapter } from "@hyprpay/discounts";
import type { EntitlementStore } from "@hyprpay/entitlements";
import type { MetersDatabaseAdapter } from "@hyprpay/meters";
import type { OrdersDatabaseAdapter } from "@hyprpay/orders";
import type { RefundsDatabaseAdapter } from "@hyprpay/refunds";
import type { SeatsDatabaseAdapter } from "@hyprpay/seats";
import type { SubscriptionsDatabaseAdapter } from "@hyprpay/subscriptions";
import type { WebhooksDatabaseAdapter } from "@hyprpay/webhooks";
import {
  billingSchema,
  drizzleAdapter,
  type BillingPgDatabase,
  type DrizzleAdapterOptions,
  billingCustomerDbInsertSchema,
  billingCustomerDbSelectSchema,
  billingCustomerDbUpdateSchema,
  billingPriceDbInsertSchema,
  billingPriceDbSelectSchema,
  billingPriceDbUpdateSchema,
  billingProductDbInsertSchema,
  billingProductDbSelectSchema,
  billingProductDbUpdateSchema,
  billingSubscriptionDbInsertSchema,
  billingSubscriptionDbSelectSchema,
  billingSubscriptionDbUpdateSchema,
  billingCustomerInsertSchema,
  billingCustomerSelectSchema,
  billingCustomerUpdateSchema,
  billingPriceInsertSchema,
  billingPriceSelectSchema,
  billingPriceUpdateSchema,
  billingProductInsertSchema,
  billingProductSelectSchema,
  billingProductUpdateSchema,
  billingSubscriptionInsertSchema,
  billingSubscriptionSelectSchema,
  billingSubscriptionUpdateSchema,
  drizzleErrors,
} from "./billing/drizzle-adapter";
import {
  drizzleOrdersAdapter,
  type DrizzleOrdersAdapterOptions,
} from "./billing/drizzle-orders-adapter";
import {
  drizzleRefundsAdapter,
  type DrizzleRefundsAdapterOptions,
} from "./billing/drizzle-refunds-adapter";
import {
  drizzleDiscountsAdapter,
  type DrizzleDiscountsAdapterOptions,
} from "./billing/drizzle-discounts-adapter";
import {
  drizzleMetersAdapter,
  type DrizzleMetersAdapterOptions,
} from "./billing/drizzle-meters-adapter";
import {
  drizzleSeatsAdapter,
  type DrizzleSeatsAdapterOptions,
} from "./billing/drizzle-seats-adapter";
import {
  billingEntitlements,
  entitlementDrizzleSchema,
  drizzleEntitlementsStore,
  type DrizzleEntitlementsStoreOptions,
  type EntitlementsPgDatabase,
} from "./entitlements/drizzle-entitlements-store";

const sliceCatalogAdapter = (adapter: ReturnType<typeof drizzleAdapter>): CatalogDatabaseAdapter => ({
  products: adapter.products,
  prices: adapter.prices,
});

const sliceCustomersAdapter = (adapter: ReturnType<typeof drizzleAdapter>): CustomersDatabaseAdapter => ({
  customers: adapter.customers,
});

const sliceCheckoutsAdapter = (adapter: ReturnType<typeof drizzleAdapter>): CheckoutsDatabaseAdapter => ({
  checkouts: adapter.checkouts,
});

const sliceChargesAdapter = (adapter: ReturnType<typeof drizzleAdapter>): ChargesDatabaseAdapter => ({
  charges: adapter.charges,
});

const sliceSubscriptionsAdapter = (adapter: ReturnType<typeof drizzleAdapter>): SubscriptionsDatabaseAdapter => ({
  subscriptions: adapter.subscriptions,
});

const sliceWebhooksAdapter = (adapter: ReturnType<typeof drizzleAdapter>): WebhooksDatabaseAdapter => ({
  events: adapter.events,
});

export const createDrizzleCatalogAdapter = (
  db: BillingPgDatabase,
  options: DrizzleAdapterOptions = {},
): CatalogDatabaseAdapter => sliceCatalogAdapter(drizzleAdapter(db, options));

export const createDrizzleCustomersAdapter = (
  db: BillingPgDatabase,
  options: DrizzleAdapterOptions = {},
): CustomersDatabaseAdapter => sliceCustomersAdapter(drizzleAdapter(db, options));

export const createDrizzleCheckoutsAdapter = (
  db: BillingPgDatabase,
  options: DrizzleAdapterOptions = {},
): CheckoutsDatabaseAdapter => sliceCheckoutsAdapter(drizzleAdapter(db, options));

export const createDrizzleChargesAdapter = (
  db: BillingPgDatabase,
  options: DrizzleAdapterOptions = {},
): ChargesDatabaseAdapter => sliceChargesAdapter(drizzleAdapter(db, options));

export const createDrizzleSubscriptionsAdapter = (
  db: BillingPgDatabase,
  options: DrizzleAdapterOptions = {},
): SubscriptionsDatabaseAdapter => sliceSubscriptionsAdapter(drizzleAdapter(db, options));

export const createDrizzleWebhooksAdapter = (
  db: BillingPgDatabase,
  options: DrizzleAdapterOptions = {},
): WebhooksDatabaseAdapter => sliceWebhooksAdapter(drizzleAdapter(db, options));

export const createDrizzleOrdersAdapter = (
  db: BillingPgDatabase,
  options: DrizzleOrdersAdapterOptions = {},
): OrdersDatabaseAdapter => drizzleOrdersAdapter(db, options);

export const createDrizzleRefundsAdapter = (
  db: BillingPgDatabase,
  options: DrizzleRefundsAdapterOptions = {},
): RefundsDatabaseAdapter => drizzleRefundsAdapter(db, options);

export const createDrizzleDiscountsAdapter = (
  db: BillingPgDatabase,
  options: DrizzleDiscountsAdapterOptions = {},
): DiscountsDatabaseAdapter => drizzleDiscountsAdapter(db, options);

export const createDrizzleMetersAdapter = (
  db: BillingPgDatabase,
  options: DrizzleMetersAdapterOptions = {},
): MetersDatabaseAdapter => drizzleMetersAdapter(db, options);

export const createDrizzleSeatsAdapter = (
  db: BillingPgDatabase,
  options: DrizzleSeatsAdapterOptions = {},
): SeatsDatabaseAdapter => drizzleSeatsAdapter(db, options);

export const createDrizzleEntitlementsStore = (
  db: EntitlementsPgDatabase,
  options: DrizzleEntitlementsStoreOptions = {},
): EntitlementStore => drizzleEntitlementsStore(db, options);

export const createDrizzleAdapters = (
  db: BillingPgDatabase,
  options: DrizzleAdapterOptions = {},
) => {
  const adapter = drizzleAdapter(db, options);

  return {
    catalog: sliceCatalogAdapter(adapter),
    customers: sliceCustomersAdapter(adapter),
    checkouts: sliceCheckoutsAdapter(adapter),
    charges: sliceChargesAdapter(adapter),
    subscriptions: sliceSubscriptionsAdapter(adapter),
    webhooks: sliceWebhooksAdapter(adapter),
    orders: drizzleOrdersAdapter(db, options),
    refunds: drizzleRefundsAdapter(db, options),
    discounts: drizzleDiscountsAdapter(db, options),
    meters: drizzleMetersAdapter(db, options),
    seats: drizzleSeatsAdapter(db, options),
  };
};

export const hyprpayDrizzleSchema = {
  ...billingSchema,
  ...entitlementDrizzleSchema,
};

export type {
  BillingPgDatabase,
  DrizzleAdapterOptions,
  DrizzleDiscountsAdapterOptions,
  DrizzleEntitlementsStoreOptions,
  DrizzleMetersAdapterOptions,
  DrizzleOrdersAdapterOptions,
  DrizzleRefundsAdapterOptions,
  DrizzleSeatsAdapterOptions,
  EntitlementsPgDatabase,
};
export {
  billingCustomerDbInsertSchema,
  billingCustomerDbSelectSchema,
  billingCustomerDbUpdateSchema,
  billingEntitlements,
  billingPriceDbInsertSchema,
  billingPriceDbSelectSchema,
  billingPriceDbUpdateSchema,
  billingProductDbInsertSchema,
  billingProductDbSelectSchema,
  billingProductDbUpdateSchema,
  billingSchema,
  billingSubscriptionDbInsertSchema,
  billingSubscriptionDbSelectSchema,
  billingSubscriptionDbUpdateSchema,
  drizzleAdapter,
  drizzleDiscountsAdapter,
  drizzleEntitlementsStore,
  drizzleErrors,
  drizzleMetersAdapter,
  drizzleOrdersAdapter,
  drizzleRefundsAdapter,
  drizzleSeatsAdapter,
  entitlementDrizzleSchema,
};
export {
  /** @deprecated use billingCustomerDbInsertSchema */
  billingCustomerInsertSchema,
  /** @deprecated use billingCustomerDbSelectSchema */
  billingCustomerSelectSchema,
  /** @deprecated use billingCustomerDbUpdateSchema */
  billingCustomerUpdateSchema,
  /** @deprecated use billingPriceDbInsertSchema */
  billingPriceInsertSchema,
  /** @deprecated use billingPriceDbSelectSchema */
  billingPriceSelectSchema,
  /** @deprecated use billingPriceDbUpdateSchema */
  billingPriceUpdateSchema,
  /** @deprecated use billingProductDbInsertSchema */
  billingProductInsertSchema,
  /** @deprecated use billingProductDbSelectSchema */
  billingProductSelectSchema,
  /** @deprecated use billingProductDbUpdateSchema */
  billingProductUpdateSchema,
  /** @deprecated use billingSubscriptionDbInsertSchema */
  billingSubscriptionInsertSchema,
  /** @deprecated use billingSubscriptionDbSelectSchema */
  billingSubscriptionSelectSchema,
  /** @deprecated use billingSubscriptionDbUpdateSchema */
  billingSubscriptionUpdateSchema,
};
