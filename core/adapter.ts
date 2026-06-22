import { Effect } from "effect";
import type { BillingEvent, CheckoutInput, Customer, CustomerInput, RefundInput, SubscriptionInput } from "./schemas";
import type { HyprPayError } from "./errors";

export interface ProviderCapabilities {
  readonly customers: boolean;
  readonly checkouts: boolean;
  readonly subscriptions: boolean;
  readonly refunds: boolean;
  readonly webhooks: boolean;
  readonly benefits?: boolean;
  readonly entitlements?: boolean;
  readonly meters?: boolean;
  readonly licenseKeys?: boolean;
  readonly downloads?: boolean;
  readonly seats?: boolean;
  readonly customerPortal?: boolean;
}

export interface CustomerRef {
  readonly provider: string;
  readonly providerCustomerId: string;
  readonly customerId?: string;
}

export interface CheckoutRef {
  readonly provider: string;
  readonly providerCheckoutId: string;
  readonly checkoutUrl?: string;
}

export interface SubscriptionRef {
  readonly provider: string;
  readonly providerSubscriptionId: string;
  readonly status: "pending" | "active" | "past_due" | "canceled";
  readonly checkoutUrl?: string;
}

export interface RefundRef {
  readonly provider: string;
  readonly providerRefundId: string;
  readonly status: "pending" | "succeeded" | "failed";
}

export interface WebhookRequest {
  readonly request: Request;
}

export interface ProviderCheckoutInput extends CheckoutInput {
  readonly customer: Customer;
}

export interface ProviderSubscriptionInput extends SubscriptionInput {
  readonly customer: Customer;
}

export interface PaymentProviderAdapter {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  createCustomer(input: CustomerInput): Effect.Effect<CustomerRef, HyprPayError>;
  createCheckout(input: ProviderCheckoutInput): Effect.Effect<CheckoutRef, HyprPayError>;
  createSubscription(input: ProviderSubscriptionInput): Effect.Effect<SubscriptionRef, HyprPayError>;
  refund(input: RefundInput): Effect.Effect<RefundRef, HyprPayError>;
  parseWebhook(input: WebhookRequest): Effect.Effect<BillingEvent, HyprPayError>;
}
