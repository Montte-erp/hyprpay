import { z } from "zod";
import { metadataSchema } from "./shared-schema";

export const discountTypeSchema = z.enum(["percentage", "fixed"]);
export const discountDurationSchema = z.enum(["once", "forever", "repeating"]);

export const discountInputSchema = z.object({
  code: z.string().min(1),
  type: discountTypeSchema,
  // value = percent (1..100) when type=percentage, centavos when type=fixed
  value: z.number().int().positive(),
  currency: z.literal("BRL").default("BRL"),
  duration: discountDurationSchema.default("once"),
  durationInCycles: z.number().int().positive().optional(),
  maxRedemptions: z.number().int().positive().optional(),
  // Scheduling window (ISO 8601). When set, apply() rejects outside the window.
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  // Product scoping. When non-empty, apply() requires the application's
  // productIds to be a subset of this allow-list.
  restrictedToProductIds: z.array(z.string().min(1)).optional(),
  active: z.boolean().default(true),
  metadata: metadataSchema.optional(),
});

export const discountSchema = discountInputSchema.extend({
  id: z.string().min(1),
  timesRedeemed: z.number().int().nonnegative().default(0),
  createdAt: z.string().min(1),
});

export type DiscountInput = z.infer<typeof discountInputSchema>;
export type Discount = z.infer<typeof discountSchema>;
