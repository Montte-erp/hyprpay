import { z } from "zod";

export const metadataSchema = z.record(z.string(), z.string()).default({});

/**
 * Benefit catalog layer. A `Benefit` is a reusable, product-attachable
 * definition (the "what the product grants") — distinct from the per-customer
 * `EntitlementGrant` (the "what a specific customer currently has").
 *
 * Two benefit types are modeled:
 *  - "custom": a feature flag and/or usage quota. `feature` is the access key,
 *    `limit` is the optional quota carried onto the per-customer grant.
 *  - "license_key": issues license keys on grant (see license-key-schema).
 */
export const benefitTypeSchema = z.enum(["custom", "license_key"]);

export const benefitInputSchema = z.object({
  productId: z.string().min(1),
  type: benefitTypeSchema.default("custom"),
  feature: z.string().min(1),
  description: z.string().min(1).optional(),
  limit: z.number().int().nonnegative().optional(),
  // license_key tuning: optional activation cap (max devices/activations).
  licenseActivationLimit: z.number().int().positive().optional(),
  // optional lifetime in seconds applied to issued grants/license keys.
  expiresInSeconds: z.number().int().positive().optional(),
  active: z.boolean().default(true),
  metadata: metadataSchema.optional(),
});

export const benefitSchema = benefitInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
});

export type BenefitType = z.infer<typeof benefitTypeSchema>;
export type BenefitInput = z.infer<typeof benefitInputSchema>;
export type Benefit = z.infer<typeof benefitSchema>;
