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

export const detectDocumentType = (document: string) => {
  if (document.length === 11) {
    return "cpf";
  }

  return "cnpj";
};
