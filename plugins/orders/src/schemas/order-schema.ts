import { z } from "zod";
import { billingAddressSchema, currencySchema, metadataSchema } from "./shared-schema";

export const billingReasonSchema = z.enum([
  "purchase",
  "subscription_create",
  "subscription_cycle",
  "subscription_update",
  "manual",
]);

export const orderStatusSchema = z.enum([
  "pending",
  "paid",
  "refunded",
  "partially_refunded",
  "canceled",
]);

export const orderLineTypeSchema = z.enum([
  "product",
  "usage",
  "proration",
  "discount",
  "tax",
]);

export const orderLineSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  priceId: z.string().optional(),
  type: orderLineTypeSchema.default("product"),
  quantity: z.number().int().positive().default(1),
  unitAmount: z.number().int(),
  amount: z.number().int(),
});

export const orderLineInputSchema = orderLineSchema.omit({ id: true, amount: true });

export const orderInputSchema = z.object({
  customerId: z.string().min(1),
  billingReason: billingReasonSchema,
  currency: currencySchema.default("BRL"),
  items: z.array(orderLineInputSchema).min(1),
  checkoutId: z.string().optional(),
  subscriptionId: z.string().optional(),
  discountAmount: z.number().int().nonnegative().default(0),
  taxAmount: z.number().int().nonnegative().default(0),
  // Billing identity snapshot captured onto the order at creation time. These
  // are denormalized copies, not just a customerId reference, so an invoice can
  // be issued without an external customer lookup.
  billingName: z.string().min(1).optional(),
  billingAddress: billingAddressSchema.optional(),
  metadata: metadataSchema.optional(),
});

// PATCH the billing identity (name/address/metadata) on an order before its
// invoice is issued. Amounts and line items are frozen; only identity fields
// may be corrected pre-issue.
export const orderBillingUpdateInputSchema = z
  .object({
    billingName: z.string().min(1).optional(),
    billingAddress: billingAddressSchema.optional(),
    // No default here (unlike metadataSchema) so an omitted metadata key stays
    // undefined and the "at least one field" refine can detect an empty patch.
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .refine(
    input =>
      input.billingName !== undefined ||
      input.billingAddress !== undefined ||
      input.metadata !== undefined,
    { message: "Informe ao menos um campo de identidade de billing para atualizar." },
  );

export const orderSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  status: orderStatusSchema,
  billingReason: billingReasonSchema,
  currency: currencySchema,
  items: z.array(orderLineSchema),
  subtotalAmount: z.number().int(),
  discountAmount: z.number().int().nonnegative(),
  taxAmount: z.number().int().nonnegative(),
  totalAmount: z.number().int().nonnegative(),
  amountRefunded: z.number().int().nonnegative().default(0),
  // net_amount = totalAmount - amountRefunded. Persisted as a denormalized,
  // always-derived field so consumers (ledger, invoice) read a single source.
  netAmount: z.number().int().nonnegative(),
  // Denormalized billing identity snapshot (see orderInputSchema).
  billingName: z.string().min(1).optional(),
  billingAddress: billingAddressSchema.optional(),
  checkoutId: z.string().optional(),
  subscriptionId: z.string().optional(),
  providerOrderId: z.string().optional(),
  metadata: metadataSchema.optional(),
  createdAt: z.string().min(1),
});

export type BillingReason = z.infer<typeof billingReasonSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderLineType = z.infer<typeof orderLineTypeSchema>;
export type OrderLine = z.infer<typeof orderLineSchema>;
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;
export type OrderInput = z.infer<typeof orderInputSchema>;
export type OrderBillingUpdateInput = z.infer<typeof orderBillingUpdateInputSchema>;
export type Order = z.infer<typeof orderSchema>;
