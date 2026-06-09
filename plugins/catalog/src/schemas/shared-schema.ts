import { z } from "zod";

export const currencySchema = z.literal("BRL");
export const paymentMethodSchema = z.enum(["pix", "boleto", "card"]);
export const billingIntervalSchema = z.enum([
  "once",
  "week",
  "month",
  "quarter",
  "half_year",
  "year",
]);
export const documentTypeSchema = z.enum(["cpf", "cnpj"]);
export const billingStrategySchema = z.enum([
  "one_time",
  "subscription",
  "subscription_with_trial",
  "metered",
  "hybrid",
  "seat",
]);
/**
 * Pricing mode for a price:
 * - "fixed": the price `amount` is the charged amount (FREE allowed when amount is 0).
 * - "custom": pay-what-you-want; the charged amount is supplied by the caller at
 *   checkout. `amount` acts as the default/fallback and may be 0; `minAmount` and
 *   `presetAmount` constrain/seed the caller-provided amount.
 */
export const priceTypeSchema = z.enum(["fixed", "custom"]);
export const metadataSchema = z.record(z.string(), z.string()).default({});

export const detectDocumentType = (document: string) => {
  if (document.length === 11) {
    return "cpf";
  }

  return "cnpj";
};
