import { z } from "zod";
import { metadataSchema, paymentMethodSchema } from "./shared-schema";

export const subscriptionStatusSchema = z.enum([
  "pending",
  "active",
  "pending_payment",
  "past_due",
  "canceled",
  "expired",
  "failed",
]);

/**
 * How a mid-cycle plan change is reconciled financially.
 * - `prorate`: credit the unused remainder of the old price and charge the
 *   prorated remainder of the new price for the rest of the current period.
 * - `none`: swap the price immediately with no proration adjustment.
 * - `next_period`: keep the current price until the period ends, then switch.
 */
export const prorationBehaviorSchema = z.enum(["prorate", "none", "next_period"]);

export const subscriptionInputSchema = z.object({
  customerId: z.string().min(1),
  priceId: z.string().min(1),
  paymentMethod: paymentMethodSchema,
  trialDays: z.number().int().nonnegative().max(90).optional(),
  metadata: metadataSchema.optional(),
  providerProductId: z.string().min(1).optional(),
  // Discount-on-subscription: opaque references coordinated with the discounts
  // lane. We accept + store them only; we never import discounts internals.
  discountId: z.string().min(1).optional(),
  discountCode: z.string().min(1).optional(),
});

export const cancelSubscriptionInputSchema = z.object({
  subscriptionId: z.string().min(1),
});

export const uncancelSubscriptionInputSchema = z.object({
  subscriptionId: z.string().min(1),
});

export const updateSubscriptionInputSchema = z.object({
  subscriptionId: z.string().min(1),
  priceId: z.string().min(1).optional(),
  prorationBehavior: prorationBehaviorSchema.default("prorate"),
  discountId: z.string().min(1).optional(),
  discountCode: z.string().min(1).optional(),
  metadata: metadataSchema.optional(),
});

export const listSubscriptionsFilterSchema = z.object({
  customerId: z.string().min(1).optional(),
  status: subscriptionStatusSchema.optional(),
  priceId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});

/** Dunning policy applied to failed renewals before auto-cancel. */
export const dunningConfigSchema = z.object({
  maxRetries: z.number().int().nonnegative().max(10).default(4),
  // Delay (in hours) before each successive retry; index 0 = first retry.
  retryIntervalsHours: z.array(z.number().int().positive()).default([24, 72, 120, 168]),
  // Extra grace window (in hours) after retries are exhausted, before cancel.
  gracePeriodHours: z.number().int().nonnegative().default(72),
});

export const markPaymentFailedInputSchema = z.object({
  subscriptionId: z.string().min(1),
  failedAt: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});

export const retryDunningInputSchema = z.object({
  subscriptionId: z.string().min(1),
  succeeded: z.boolean().default(false),
  attemptedAt: z.string().min(1).optional(),
});

export const recordUsageInputSchema = z.object({
  subscriptionId: z.string().min(1),
  productId: z.string().min(1),
  units: z.number().int().positive(),
  action: z.enum(["add", "subtract"]),
});

export const usageRecordSchema = z.object({
  id: z.string().min(1),
  subscriptionId: z.string().min(1),
  productId: z.string().min(1),
  units: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  action: z.enum(["add", "subtract"]),
  installmentNumber: z.number().int().positive(),
  recordedAt: z.string().min(1),
});

export const subscriptionSchema = subscriptionInputSchema.extend({
  id: z.string().min(1),
  providerSubscriptionId: z.string().optional(),
  status: subscriptionStatusSchema,
  currentPeriodStart: z.string().optional(),
  currentPeriodEnd: z.string().optional(),
  cancelAtPeriodEnd: z.boolean().default(false),
  canceledAt: z.string().optional(),
  endedAt: z.string().optional(),
  trialEndsAt: z.string().optional(),
  // Dunning state machine fields (set once a renewal fails).
  pastDueAt: z.string().optional(),
  dunningRetryCount: z.number().int().nonnegative().default(0),
  nextRetryAt: z.string().optional(),
  graceEndsAt: z.string().optional(),
  lastPaymentError: z.string().optional(),
});

/**
 * Result of a plan-change proration computation. `creditAmount` is the unused
 * remainder of the outgoing price; `chargeAmount` is the prorated remainder of
 * the incoming price; `netAmount = chargeAmount - creditAmount` (may be < 0,
 * representing a credit owed to the customer). All values are integer centavos.
 */
export const prorationResultSchema = z.object({
  creditAmount: z.number().int().nonnegative(),
  chargeAmount: z.number().int().nonnegative(),
  netAmount: z.number().int(),
});

export const subscriptionUpdateResultSchema = z.object({
  subscription: subscriptionSchema,
  proration: prorationResultSchema.optional(),
});

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionInputSchema>;
export type UncancelSubscriptionInput = z.infer<typeof uncancelSubscriptionInputSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionInputSchema>;
export type ListSubscriptionsFilter = z.infer<typeof listSubscriptionsFilterSchema>;
export type DunningConfig = z.infer<typeof dunningConfigSchema>;
export type MarkPaymentFailedInput = z.infer<typeof markPaymentFailedInputSchema>;
export type RetryDunningInput = z.infer<typeof retryDunningInputSchema>;
export type RecordUsageInput = z.infer<typeof recordUsageInputSchema>;
export type UsageRecord = z.infer<typeof usageRecordSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;
export type ProrationResult = z.infer<typeof prorationResultSchema>;
export type SubscriptionUpdateResult = z.infer<typeof subscriptionUpdateResultSchema>;
export type ProrationBehavior = z.infer<typeof prorationBehaviorSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
