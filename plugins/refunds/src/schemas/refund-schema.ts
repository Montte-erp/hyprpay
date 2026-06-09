import { z } from "zod";
import { metadataSchema } from "./shared-schema";

export const refundStatusSchema = z.enum(["pending", "succeeded", "failed", "canceled"]);
export const refundReasonSchema = z.enum([
  "requested_by_customer",
  "duplicate",
  "fraudulent",
  "other",
]);

export const refundInputSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive().optional(),
  reason: refundReasonSchema.default("requested_by_customer"),
  metadata: metadataSchema.optional(),
});

export const refundSchema = refundInputSchema.extend({
  id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.literal("BRL"),
  status: refundStatusSchema,
  // Denormalized from the order at creation time so refunds can be listed by
  // customer / subscription without joining back through orders on every query.
  customerId: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  providerRefundId: z.string().optional(),
  // ISO timestamp of the last settled transition (succeeded/failed/canceled).
  settledAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1).optional(),
});

// Terminal statuses can no longer transition; a refund only settles once.
export const refundTerminalStatuses = ["succeeded", "failed", "canceled"] as const;

export const refundTransitionInputSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["succeeded", "failed", "canceled"]),
  providerRefundId: z.string().optional(),
  metadata: metadataSchema.optional(),
});

// Listing filters. orderId keeps backward-compat with listByOrder; customerId /
// subscriptionId enable the broader listings required by the spec.
export const refundListFilterSchema = z.object({
  orderId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  status: refundStatusSchema.optional(),
  limit: z.number().int().positive().max(200).optional(),
  cursor: z.string().min(1).optional(),
});

export type RefundStatus = z.infer<typeof refundStatusSchema>;
export type RefundTerminalStatus = (typeof refundTerminalStatuses)[number];
export type RefundReason = z.infer<typeof refundReasonSchema>;
export type RefundInput = z.infer<typeof refundInputSchema>;
export type RefundTransitionInput = z.infer<typeof refundTransitionInputSchema>;
export type RefundListFilter = z.infer<typeof refundListFilterSchema>;
export type Refund = z.infer<typeof refundSchema>;
