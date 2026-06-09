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
export const metadataSchema = z.record(z.string(), z.string()).default({});

/**
 * Structured Brazilian billing address. Required by the orders/invoice billing
 * identity. All fields optional so partial capture (e.g. checkout) is allowed;
 * `country` defaults to the literal "BR".
 */
export const billingAddressSchema = z.object({
  line1: z.string().min(1).optional(),
  line2: z.string().min(1).optional(),
  district: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  country: z.string().min(1).default("BR"),
});

export const detectDocumentType = (document: string) => {
  if (document.length === 11) {
    return "cpf";
  }

  return "cnpj";
};
