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

export const billingAddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1).default("BR"),
});

export type BillingAddress = z.infer<typeof billingAddressSchema>;

export const detectDocumentType = (document: string) => {
  if (document.length === 11) {
    return "cpf";
  }

  return "cnpj";
};
