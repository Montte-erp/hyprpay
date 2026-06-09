import { z } from "zod";
import { abacatePayCycleSchema, abacatePayMethodSchema } from "./abacatepay-request-schema";

export interface AbacatePayEnvelope<TData> {
  data: TData;
  success: boolean;
  error: string | null;
}

export const abacatePayEnvelopeSchema = <TSchema extends z.ZodType>(dataSchema: TSchema) =>
  z.object({
    data: dataSchema,
    success: z.boolean(),
    error: z.string().nullable(),
  });

export const abacatePayCustomerResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  taxId: z.string().optional(),
  cellphone: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const abacatePayProductResponseSchema = z.object({
  id: z.string().min(1),
  externalId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().int().positive(),
  currency: z.literal("BRL"),
  cycle: abacatePayCycleSchema.nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const abacatePayBillingResponseSchema = z.object({
  id: z.string().min(1),
  externalId: z.string().nullable().optional(),
  url: z.string().url(),
  amount: z.number().int().positive(),
  paidAmount: z.number().int().nullable().optional(),
  items: z.array(z.object({ id: z.string().min(1), quantity: z.number().int().positive() })),
  status: z.enum(["PENDING", "EXPIRED", "CANCELLED", "PAID", "REFUNDED"]),
  customerId: z.string().nullable().optional(),
  methods: z.array(abacatePayMethodSchema).optional(),
  returnUrl: z.string().url().nullable().optional(),
  completionUrl: z.string().url().nullable().optional(),
  receiptUrl: z.string().url().nullable().optional(),
});

export const abacatePayTransparentChargeResponseSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().positive(),
  status: z.enum(["PENDING", "PAID", "EXPIRED", "CANCELLED", "REFUNDED"]),
  brCode: z.string().optional(),
  brCodeBase64: z.string().optional(),
  barCode: z.string().optional(),
  url: z.string().url().optional(),
  receiptUrl: z.string().url().nullable().optional(),
  expiresAt: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const abacatePaySubscriptionResponseSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  amount: z.number().int().positive(),
  status: z.enum(["PENDING", "ACTIVE", "CANCELLED", "EXPIRED", "FAILED"]),
  method: z.enum(["PIX", "CARD"]),
  trialDays: z.number().int().nullable().optional(),
  trialEndsAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  canceledAt: z.string().nullable().optional(),
});

export const abacatePayUsageRecordResponseSchema = z.object({
  id: z.string().min(1),
  subscriptionId: z.string().min(1),
  productId: z.string().min(1),
  units: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  action: z.enum(["add", "subtract"]),
  installmentNumber: z.number().int().positive(),
  recordedAt: z.string().min(1),
});

export const abacatePayWebhookSchema = z.object({
  id: z.string().min(1).optional(),
  event: z.string().min(1),
  apiVersion: z.number().int().optional(),
  devMode: z.boolean().optional(),
  createdAt: z.string().optional(),
  data: z.object({}).passthrough(),
});
