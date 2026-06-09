import { z } from "zod";

export const entitlementGrantSchema = z.object({
  customerId: z.string().min(1),
  feature: z.string().min(1),
  limit: z.number().int().nonnegative().optional(),
  // optional provenance: which benefit/product drove this grant (lifecycle).
  benefitId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  // optional source subscription/order so a revoke can target the same scope.
  sourceId: z.string().min(1).optional(),
});

export const entitlementCheckInputSchema = z.object({
  customerId: z.string().min(1),
  feature: z.string().min(1),
});

export const entitlementConsumeInputSchema = entitlementCheckInputSchema.extend({
  amount: z.number().int().positive(),
});

export const entitlementRevokeInputSchema = entitlementCheckInputSchema;

export const entitlementCheckSchema = z.object({
  allowed: z.boolean(),
  feature: z.string().min(1),
  limit: z.number().int().nonnegative().optional(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative().optional(),
});

export type EntitlementGrant = z.infer<typeof entitlementGrantSchema>;
export type EntitlementCheckInput = z.infer<typeof entitlementCheckInputSchema>;
export type EntitlementConsumeInput = z.infer<typeof entitlementConsumeInputSchema>;
export type EntitlementRevokeInput = z.infer<typeof entitlementRevokeInputSchema>;
export type EntitlementCheck = z.infer<typeof entitlementCheckSchema>;
