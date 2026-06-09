import { z } from "zod";
import { metadataSchema } from "./shared-schema";

export const productInputSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  metadata: metadataSchema.optional(),
  active: z.boolean().default(true),
});

export const productSchema = productInputSchema.extend({
  id: z.string().min(1),
});

/**
 * Partial patch applied to an existing product. All fields optional; only the
 * provided keys are changed. Archiving (soft delete) flips `active` to false and
 * is exposed as a dedicated CatalogApi op rather than a raw field here.
 *
 * Defaults are stripped (active/metadata) so that a patch that omits a key leaves
 * the existing value untouched instead of resetting it to the create-time default.
 */
export const productUpdateInputSchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    metadata: z.record(z.string(), z.string()),
    active: z.boolean(),
  })
  .partial();

/**
 * Filter for listing products. Omitted fields are not constrained. `active`
 * narrows to active/archived products.
 */
export const productListFilterSchema = z.object({
  active: z.boolean().optional(),
  slug: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const providerProductInputSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  // FREE pricing: zero is a valid amount (mirrors price-schema.amount).
  amount: z.number().int().nonnegative(),
  currency: z.literal("BRL"),
  interval: z.enum(["once", "week", "month", "quarter", "half_year", "year"]),
  trialDays: z.number().int().positive().max(90).optional(),
  metadata: metadataSchema.optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type Product = z.infer<typeof productSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateInputSchema>;
export type ProductListFilter = z.infer<typeof productListFilterSchema>;
export type ProviderProductInput = z.infer<typeof providerProductInputSchema>;
