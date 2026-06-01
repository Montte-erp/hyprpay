import { z } from "zod";

export const currencySchema = z.literal("BRL");
export const paymentMethodSchema = z.enum(["pix", "boleto", "card"]);
export const billingIntervalSchema = z.enum(["once", "month", "year"]);
export const chargeStatusSchema = z.enum([
  "pending",
  "paid",
  "failed",
  "expired",
  "refunded",
  "canceled",
]);
export const subscriptionStatusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "ended",
  "incomplete",
  "pending_payment",
]);
export const documentTypeSchema = z.enum(["cpf", "cnpj"]);
export const metadataSchema = z.record(z.string(), z.string()).default({});

export const customerInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  document: z.string().min(11).max(14),
  phone: z.string().optional(),
  metadata: metadataSchema.optional(),
});

export const customerSchema = customerInputSchema.extend({
  id: z.string().min(1),
  providerCustomerId: z.string().optional(),
  documentType: documentTypeSchema,
});

export const checkoutInputSchema = z.object({
  customerId: z.string().min(1),
  priceId: z.string().min(1),
  methods: z.array(paymentMethodSchema).min(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  metadata: metadataSchema.optional(),
});

export const checkoutSchema = checkoutInputSchema.extend({
  id: z.string().min(1),
  providerCheckoutId: z.string().optional(),
  url: z.string().url(),
});

export const boletoOptionsSchema = z.object({
  dueDate: z.string().min(10),
  finePercent: z.number().nonnegative().optional(),
  interestPercentPerMonth: z.number().nonnegative().optional(),
  instructions: z.string().optional(),
});

export const cardOptionsSchema = z.object({
  token: z.string().min(1),
  installments: z.number().int().positive().default(1),
});

export const chargeInputSchema = z.object({
  customerId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: currencySchema.default("BRL"),
  method: paymentMethodSchema,
  description: z.string().optional(),
  expiresInMinutes: z.number().int().positive().optional(),
  boleto: boletoOptionsSchema.optional(),
  card: cardOptionsSchema.optional(),
  metadata: metadataSchema.optional(),
});

export const chargeSchema = chargeInputSchema.extend({
  id: z.string().min(1),
  providerChargeId: z.string().optional(),
  status: chargeStatusSchema,
  pix: z
    .object({
      qrCodeUrl: z.string().url().optional(),
      copyPaste: z.string().optional(),
      expiresAt: z.string().optional(),
    })
    .optional(),
  boletoDetails: z
    .object({
      bankSlipUrl: z.string().url().optional(),
      digitableLine: z.string().optional(),
      dueDate: z.string().optional(),
    })
    .optional(),
});

export const subscriptionInputSchema = z.object({
  customerId: z.string().min(1),
  priceId: z.string().min(1),
  paymentMethod: paymentMethodSchema,
  trialDays: z.number().int().nonnegative().optional(),
  metadata: metadataSchema.optional(),
});

export const subscriptionSchema = subscriptionInputSchema.extend({
  id: z.string().min(1),
  providerSubscriptionId: z.string().optional(),
  status: subscriptionStatusSchema,
  currentPeriodStart: z.string().optional(),
  currentPeriodEnd: z.string().optional(),
});

export const entitlementGrantSchema = z.object({
  customerId: z.string().min(1),
  feature: z.string().min(1),
  limit: z.number().int().nonnegative().optional(),
});

export const entitlementCheckInputSchema = z.object({
  customerId: z.string().min(1),
  feature: z.string().min(1),
});

export const entitlementConsumeInputSchema = entitlementCheckInputSchema.extend({
  amount: z.number().int().positive(),
});

export const entitlementCheckSchema = z.object({
  allowed: z.boolean(),
  feature: z.string().min(1),
  limit: z.number().int().nonnegative().optional(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative().optional(),
});

export const billingEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "checkout.created",
    "checkout.completed",
    "payment.created",
    "payment.pending",
    "payment.paid",
    "payment.failed",
    "payment.refunded",
    "subscription.created",
    "subscription.activated",
    "subscription.past_due",
    "subscription.canceled",
    "invoice.created",
    "invoice.paid",
    "invoice.overdue",
    "entitlement.granted",
    "entitlement.revoked",
  ]),
  provider: z.string().min(1),
  customerId: z.string().optional(),
  chargeId: z.string().optional(),
  subscriptionId: z.string().optional(),
  occurredAt: z.string().min(1),
  payload: z.unknown(),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export type Checkout = z.infer<typeof checkoutSchema>;
export type ChargeInput = z.infer<typeof chargeInputSchema>;
export type Charge = z.infer<typeof chargeSchema>;
export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;
export type EntitlementGrant = z.infer<typeof entitlementGrantSchema>;
export type EntitlementCheckInput = z.infer<typeof entitlementCheckInputSchema>;
export type EntitlementConsumeInput = z.infer<typeof entitlementConsumeInputSchema>;
export type EntitlementCheck = z.infer<typeof entitlementCheckSchema>;
export type BillingEvent = z.infer<typeof billingEventSchema>;
