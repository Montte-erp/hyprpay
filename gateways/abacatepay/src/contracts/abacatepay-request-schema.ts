import { z } from "zod";

export const abacatePayMethodSchema = z.enum(["PIX", "BOLETO", "CARD"]);
export const abacatePayCycleSchema = z.enum([
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUALLY",
  "ANNUALLY",
]);

export const abacatePayCustomerRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  cellphone: z.string().min(1).optional(),
  taxId: z.string().min(11).max(18).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const abacatePayProductRequestSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  price: z.number().int().positive(),
  currency: z.literal("BRL"),
  description: z.string().optional(),
  cycle: abacatePayCycleSchema.optional(),
  trialDays: z.number().int().positive().max(90).optional(),
});

export const abacatePayCheckoutRequestSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  customerId: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
  returnUrl: z.string().url().optional(),
  completionUrl: z.string().url().optional(),
  methods: z.array(abacatePayMethodSchema).min(1).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const abacatePayTransparentChargeRequestSchema = z.object({
  method: z.enum(["PIX", "BOLETO"]),
  data: z.object({
    amount: z.number().int().positive(),
    expiresIn: z.number().int().positive().optional(),
    description: z.string().max(500).optional(),
    customer: z
      .object({
        name: z.string().min(1),
        email: z.string().email().optional(),
        taxId: z.string().min(11).max(18),
        cellphone: z.string().min(1).optional(),
      })
      .optional(),
    externalId: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
});

export const abacatePayCancelSubscriptionRequestSchema = z.object({
  id: z.string().min(1),
});

export const abacatePayRecordUsageRequestSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  units: z.number().int().positive(),
  action: z.enum(["add", "subtract"]),
});
