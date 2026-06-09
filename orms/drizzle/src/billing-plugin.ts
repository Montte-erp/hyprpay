import type { CatalogDatabaseAdapter } from "@hyprpay/catalog";
import type { ChargesDatabaseAdapter } from "@hyprpay/charges";
import type { CheckoutsDatabaseAdapter } from "@hyprpay/checkouts";
import type { CustomersDatabaseAdapter } from "@hyprpay/customers";
import type { SubscriptionsDatabaseAdapter } from "@hyprpay/subscriptions";
import type { WebhooksDatabaseAdapter } from "@hyprpay/webhooks";

export type { BillingResult } from "@hyprpay/catalog";
export type { Product } from "@hyprpay/catalog";
export { BillingError, billingErrors, priceSchema, productSchema } from "@hyprpay/catalog";
export type { Price } from "@hyprpay/catalog";
export type { Charge } from "@hyprpay/charges";
export { chargeSchema } from "@hyprpay/charges";
export type { Checkout } from "@hyprpay/checkouts";
export { checkoutSchema } from "@hyprpay/checkouts";
export type { BillingAddress, Customer } from "@hyprpay/customers";
export { customerSchema } from "@hyprpay/customers";
export type { Subscription } from "@hyprpay/subscriptions";
export { subscriptionSchema } from "@hyprpay/subscriptions";
export type { BillingEvent } from "@hyprpay/webhooks";
export { billingEventSchema } from "@hyprpay/webhooks";

export type BillingDatabaseAdapter =
  & CatalogDatabaseAdapter
  & CustomersDatabaseAdapter
  & CheckoutsDatabaseAdapter
  & ChargesDatabaseAdapter
  & SubscriptionsDatabaseAdapter
  & WebhooksDatabaseAdapter;
