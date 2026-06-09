import { z } from "zod";
import { currencySchema, metadataSchema, paymentMethodSchema } from "./shared-schema";

export const chargeStatusSchema = z.enum([
  "pending",
  "paid",
  "failed",
  "expired",
  "canceled",
  "refunded",
]);

export const boletoOptionsSchema = z.object({
  dueDate: z.string().optional(),
}).optional();

export const cardOptionsSchema = z.object({
  installments: z.number().int().positive().max(12).optional(),
}).optional();

export const chargeInputSchema = z.object({
  customerId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: currencySchema.default("BRL"),
  method: paymentMethodSchema,
  description: z.string().optional(),
  expiresInMinutes: z.number().int().positive().optional(),
  boleto: boletoOptionsSchema,
  card: cardOptionsSchema,
  metadata: metadataSchema.optional(),
});

export const chargeSchema = chargeInputSchema.extend({
  id: z.string().min(1),
  providerChargeId: z.string().optional(),
  status: chargeStatusSchema,
  receiptUrl: z.string().url().optional(),
  pix: z
    .object({
      qrCodeUrl: z.string().url().optional(),
      copyPaste: z.string().optional(),
      expiresAt: z.string().optional(),
    })
    .optional(),
  boletoDetails: z
    .object({
      bankSlipUrl: z.string().url().optional(),
      digitableLine: z.string().optional(),
      dueDate: z.string().optional(),
    })
    .optional(),
});

export type ChargeInput = z.infer<typeof chargeInputSchema>;
export type Charge = z.infer<typeof chargeSchema>;
