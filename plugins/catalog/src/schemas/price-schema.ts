import { z } from "zod";
import {
  billingIntervalSchema,
  billingStrategySchema,
  currencySchema,
  metadataSchema,
  priceTypeSchema,
} from "./shared-schema";

export const priceInputSchema = z.object({
  productId: z.string().min(1),
  slug: z.string().min(1),
  // Defect 1 (FREE pricing): zero is a valid charged amount, so use nonnegative
  // instead of positive. Negative amounts remain rejected.
  amount: z.number().int().nonnegative(),
  currency: currencySchema.default("BRL"),
  interval: billingIntervalSchema,
  trialDays: z.number().int().nonnegative().max(90).optional(),
  usageBased: z.boolean().default(false),
  billingStrategy: billingStrategySchema.optional(),
  // Defect 2 (PWYW / custom pricing): when priceType is "custom", the charged
  // amount is provided by the caller at checkout. `amount` is the default,
  // `minAmount` is the floor, `presetAmount` is the suggested value shown to the
  // payer. For "fixed" prices these custom fields are ignored.
  priceType: priceTypeSchema.default("fixed"),
  minAmount: z.number().int().nonnegative().optional(),
  presetAmount: z.number().int().nonnegative().optional(),
  // Defect 3 (metered pricing binding): bind a usage/metered price to a meter
  // (owned by the meters lane) and the per-unit price (centavos) so usage can be
  // priced into orders. Both are optional and apply to metered/hybrid strategies.
  meterId: z.string().min(1).optional(),
  unitAmount: z.number().int().nonnegative().optional(),
  providerProductId: z.string().min(1).optional(),
  metadata: metadataSchema.optional(),
  active: z.boolean().default(true),
});

export const priceSchema = priceInputSchema.extend({
  id: z.string().min(1),
});

/**
 * Partial patch applied to an existing price. `productId` is immutable, so it is
 * not patchable here. All fields are optional; only provided keys are changed.
 *
 * Defaults are stripped (currency/priceType/usageBased/active) so that a patch
 * that omits a key leaves the existing value untouched instead of resetting it
 * to the create-time default.
 */
export const priceUpdateInputSchema = z
  .object({
    slug: z.string().min(1),
    amount: z.number().int().nonnegative(),
    currency: currencySchema,
    interval: billingIntervalSchema,
    trialDays: z.number().int().nonnegative().max(90),
    usageBased: z.boolean(),
    billingStrategy: billingStrategySchema,
    priceType: priceTypeSchema,
    minAmount: z.number().int().nonnegative(),
    presetAmount: z.number().int().nonnegative(),
    meterId: z.string().min(1),
    unitAmount: z.number().int().nonnegative(),
    providerProductId: z.string().min(1),
    metadata: z.record(z.string(), z.string()),
    active: z.boolean(),
  })
  .partial();

/**
 * Filter for listing prices. Omitted fields are not constrained.
 */
export const priceListFilterSchema = z.object({
  productId: z.string().min(1).optional(),
  active: z.boolean().optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export type PriceInput = z.infer<typeof priceInputSchema>;
export type Price = z.infer<typeof priceSchema>;
export type PriceUpdateInput = z.infer<typeof priceUpdateInputSchema>;
export type PriceListFilter = z.infer<typeof priceListFilterSchema>;
