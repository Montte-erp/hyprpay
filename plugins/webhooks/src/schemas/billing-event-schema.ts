import { z } from "zod";

export const billingEventTypeSchema = z.enum([
  "checkout.created",
  "checkout.completed",
  "checkout.disputed",
  "checkout.refunded",
  "payment.created",
  "payment.pending",
  "payment.paid",
  "payment.failed",
  "payment.refunded",
  "subscription.created",
  "subscription.trial_started",
  "subscription.completed",
  "subscription.renewed",
  "subscription.canceled",
  "subscription.past_due",
  "invoice.created",
  "invoice.paid",
  "invoice.overdue",
]);

export const billingEventSchema = z.object({
  id: z.string().min(1),
  type: billingEventTypeSchema,
  provider: z.string().min(1),
  externalId: z.string().min(1).optional(),
  customerId: z.string().optional(),
  chargeId: z.string().optional(),
  subscriptionId: z.string().optional(),
  occurredAt: z.string().min(1),
  payload: z.unknown(),
});

export type BillingEvent = z.infer<typeof billingEventSchema>;
export type BillingEventType = z.infer<typeof billingEventTypeSchema>;
