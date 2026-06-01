import type { Result } from "better-result";
import type { BillingError } from "./errors";
import type {
  BillingEvent,
  Charge,
  ChargeInput,
  Checkout,
  CheckoutInput,
  Customer,
  CustomerInput,
  Subscription,
  SubscriptionInput,
} from "./schemas";

export type BillingResult<T> = Result<T, BillingError>;

export interface PaymentProviderAdapter {
  id: string;
  createCustomer(input: CustomerInput): Promise<BillingResult<Customer>>;
  createCheckout(input: CheckoutInput): Promise<BillingResult<Checkout>>;
  createCharge(input: ChargeInput): Promise<BillingResult<Charge>>;
  createSubscription(input: SubscriptionInput): Promise<BillingResult<Subscription>>;
  parseWebhook(input: Request): Promise<BillingResult<BillingEvent>>;
}
