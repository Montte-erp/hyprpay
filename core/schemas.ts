import { Effect, Schema } from "effect";
import { invalidInput, type HyprPayError } from "./errors";

const nonNegativeIntSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const optionalNonEmptyString = Schema.NonEmptyString.pipe(Schema.optionalKey);
const optionalMetadata = Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optionalKey);
const optionalUrlString = Schema.String.pipe(Schema.optionalKey);
const optionalDateTimeString = Schema.String.pipe(Schema.optionalKey);
const paymentMethodSchema = Schema.Literals(["pix", "boleto", "card"]);
const benefitTypeSchema = Schema.Literals([
  "feature_flag",
  "meter_credits",
  "license_key",
  "file_download",
  "github_repository",
  "discord_role",
  "slack_channel",
  "seats",
  "custom",
]);
const benefitGrantStatusSchema = Schema.Literals(["active", "revoked"]);
const licenseKeyStatusSchema = Schema.Literals(["active", "revoked", "expired"]);

export const customerInputSchema = Schema.Struct({
  externalId: optionalNonEmptyString,
  name: Schema.NonEmptyString,
  email: optionalNonEmptyString,
  document: optionalNonEmptyString,
  metadata: optionalMetadata,
});

export const customerSchema = Schema.Struct({
  externalId: optionalNonEmptyString,
  name: Schema.NonEmptyString,
  email: optionalNonEmptyString,
  document: optionalNonEmptyString,
  metadata: optionalMetadata,
  provider: optionalNonEmptyString,
  providerCustomerId: optionalNonEmptyString,
  id: Schema.NonEmptyString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const checkoutInputSchema = Schema.Struct({
  planId: optionalNonEmptyString,
  customerId: Schema.NonEmptyString,
  amount: nonNegativeIntSchema,
  currency: Schema.Literal("BRL").pipe(Schema.optionalKey),
  methods: Schema.Array(paymentMethodSchema).pipe(Schema.optionalKey),
  description: optionalNonEmptyString,
  successUrl: optionalUrlString,
  cancelUrl: optionalUrlString,
  metadata: optionalMetadata,
});

export const checkoutSchema = Schema.Struct({
  planId: optionalNonEmptyString,
  customerId: Schema.NonEmptyString,
  amount: nonNegativeIntSchema,
  currency: Schema.Literal("BRL"),
  methods: Schema.Array(paymentMethodSchema).pipe(Schema.optionalKey),
  description: optionalNonEmptyString,
  successUrl: optionalUrlString,
  cancelUrl: optionalUrlString,
  metadata: optionalMetadata,
  provider: optionalNonEmptyString,
  providerCheckoutId: optionalNonEmptyString,
  checkoutUrl: optionalUrlString,
  id: Schema.NonEmptyString,
  status: Schema.Literals(["pending", "paid", "canceled", "expired"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const orderSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  customerId: Schema.NonEmptyString,
  checkoutId: optionalNonEmptyString,
  amount: nonNegativeIntSchema,
  currency: Schema.Literal("BRL"),
  status: Schema.Literals(["pending", "paid", "canceled", "refunded"]),
  provider: optionalNonEmptyString,
  providerOrderId: optionalNonEmptyString,
  paidAt: optionalDateTimeString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  metadata: optionalMetadata,
});

export const subscriptionInputSchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  planId: Schema.NonEmptyString,
  successUrl: optionalUrlString,
  cancelUrl: optionalUrlString,
  metadata: optionalMetadata,
});

export const subscriptionSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  customerId: Schema.NonEmptyString,
  planId: Schema.NonEmptyString,
  provider: optionalNonEmptyString,
  providerSubscriptionId: optionalNonEmptyString,
  checkoutUrl: optionalUrlString,
  status: Schema.Literals(["pending", "active", "past_due", "canceled"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  metadata: optionalMetadata,
});

export const refundInputSchema = Schema.Struct({
  orderId: Schema.NonEmptyString,
  providerOrderId: optionalNonEmptyString,
  amount: nonNegativeIntSchema.pipe(Schema.optionalKey),
  reason: optionalNonEmptyString,
  metadata: optionalMetadata,
});

export const refundSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  orderId: Schema.NonEmptyString,
  provider: optionalNonEmptyString,
  providerRefundId: optionalNonEmptyString,
  status: Schema.Literals(["pending", "succeeded", "failed"]),
  amount: nonNegativeIntSchema.pipe(Schema.optionalKey),
  reason: optionalNonEmptyString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  metadata: optionalMetadata,
});
export const benefitGrantSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  customerId: Schema.NonEmptyString,
  benefitId: Schema.NonEmptyString,
  type: benefitTypeSchema,
  sourceId: optionalNonEmptyString,
  status: benefitGrantStatusSchema,
  expiresAt: optionalDateTimeString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  metadata: optionalMetadata,
});

export const usageRecordSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  customerId: Schema.NonEmptyString,
  meterId: Schema.NonEmptyString,
  amount: nonNegativeIntSchema,
  idempotencyKey: optionalNonEmptyString,
  createdAt: Schema.String,
  metadata: optionalMetadata,
});

export const licenseKeySchema = Schema.Struct({
  id: Schema.NonEmptyString,
  customerId: Schema.NonEmptyString,
  benefitId: optionalNonEmptyString,
  key: Schema.NonEmptyString,
  status: licenseKeyStatusSchema,
  activationsLimit: nonNegativeIntSchema.pipe(Schema.optionalKey),
  usageLimit: nonNegativeIntSchema.pipe(Schema.optionalKey),
  usage: nonNegativeIntSchema,
  validations: nonNegativeIntSchema,
  lastValidatedAt: optionalDateTimeString,
  expiresAt: optionalDateTimeString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  metadata: optionalMetadata,
});

export const licenseKeyActivationSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  licenseKeyId: Schema.NonEmptyString,
  instanceId: Schema.NonEmptyString,
  label: optionalNonEmptyString,
  status: Schema.Literals(["active", "deactivated"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  metadata: optionalMetadata,
});

export const seatSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  customerId: Schema.NonEmptyString,
  subscriptionId: optionalNonEmptyString,
  memberId: Schema.NonEmptyString,
  email: optionalNonEmptyString,
  status: Schema.Literals(["active", "revoked"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  metadata: optionalMetadata,
});

export const portalSessionSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  customerId: Schema.NonEmptyString,
  token: Schema.NonEmptyString,
  url: optionalUrlString,
  returnUrl: optionalUrlString,
  expiresAt: Schema.String,
  createdAt: Schema.String,
});


export const billingEventInputSchema = Schema.Struct({
  processor: Schema.NonEmptyString,
  type: Schema.Literals([
    "checkout.paid",
    "checkout.canceled",
    "checkout.expired",
    "subscription.created",
    "subscription.active",
    "subscription.past_due",
    "subscription.canceled",
    "unknown",
  ]),
  checkoutId: optionalNonEmptyString,
  customerId: optionalNonEmptyString,
  amount: nonNegativeIntSchema.pipe(Schema.optionalKey),
  subscriptionId: optionalNonEmptyString,
  providerOrderId: optionalNonEmptyString,
  occurredAt: optionalDateTimeString,
  payload: Schema.Unknown.pipe(Schema.optionalKey),
});

export const billingEventSchema = Schema.Struct({
  processor: Schema.NonEmptyString,
  type: Schema.Literals([
    "checkout.paid",
    "checkout.canceled",
    "checkout.expired",
    "subscription.created",
    "subscription.active",
    "subscription.past_due",
    "subscription.canceled",
    "unknown",
  ]),
  checkoutId: optionalNonEmptyString,
  customerId: optionalNonEmptyString,
  amount: nonNegativeIntSchema.pipe(Schema.optionalKey),
  subscriptionId: optionalNonEmptyString,
  providerOrderId: optionalNonEmptyString,
  occurredAt: Schema.String,
  payload: Schema.Unknown.pipe(Schema.optionalKey),
  id: Schema.NonEmptyString,
});

export type CustomerInput = Schema.Schema.Type<typeof customerInputSchema>;
export type Customer = Schema.Schema.Type<typeof customerSchema>;
export type CheckoutInput = Schema.Schema.Type<typeof checkoutInputSchema>;
export type Checkout = Schema.Schema.Type<typeof checkoutSchema>;
export type Order = Schema.Schema.Type<typeof orderSchema>;
export type RefundInput = Schema.Schema.Type<typeof refundInputSchema>;
export type Refund = Schema.Schema.Type<typeof refundSchema>;
export type SubscriptionInput = Schema.Schema.Type<typeof subscriptionInputSchema>;
export type Subscription = Schema.Schema.Type<typeof subscriptionSchema>;
export type BenefitGrant = Schema.Schema.Type<typeof benefitGrantSchema>;
export type UsageRecord = Schema.Schema.Type<typeof usageRecordSchema>;
export type LicenseKey = Schema.Schema.Type<typeof licenseKeySchema>;
export type LicenseKeyActivation = Schema.Schema.Type<typeof licenseKeyActivationSchema>;
export type Seat = Schema.Schema.Type<typeof seatSchema>;
export type PortalSession = Schema.Schema.Type<typeof portalSessionSchema>;
export type BillingEventInput = Schema.Schema.Type<typeof billingEventInputSchema>;
export type BillingEvent = Schema.Schema.Type<typeof billingEventSchema>;

export const decodeCustomerInput = (input: CustomerInput): Effect.Effect<CustomerInput, HyprPayError> =>
  Schema.decodeUnknownEffect(customerInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeCheckoutInput = (input: CheckoutInput): Effect.Effect<CheckoutInput, HyprPayError> =>
  Schema.decodeUnknownEffect(checkoutInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeSubscriptionInput = (input: SubscriptionInput): Effect.Effect<SubscriptionInput, HyprPayError> =>
  Schema.decodeUnknownEffect(subscriptionInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeRefundInput = (input: RefundInput): Effect.Effect<RefundInput, HyprPayError> =>
  Schema.decodeUnknownEffect(refundInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeBillingEventInput = (input: BillingEventInput): Effect.Effect<BillingEventInput, HyprPayError> =>
  Schema.decodeUnknownEffect(billingEventInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));
