import { z } from "zod";
import { billingAddressSchema, currencySchema, metadataSchema } from "./shared-schema";

export const invoiceStatusSchema = z.enum(["draft", "issued"]);

// Input to open an invoice/receipt document for an existing order. The invoice
// is a numbered fiscal document linked to a single order; amount and billing
// identity are snapshotted from the order at creation time.
export const invoiceInputSchema = z.object({
  orderId: z.string().min(1),
  metadata: metadataSchema.optional(),
});

export const invoiceSchema = z.object({
  id: z.string().min(1),
  // Sequential, monotonic per-namespace invoice number (zero-padded string),
  // assigned only once the invoice is issued.
  invoiceNumber: z.string().min(1).optional(),
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  status: invoiceStatusSchema,
  currency: currencySchema,
  // Total payable, snapshotted from the order at draft time (integer centavos).
  amount: z.number().int().nonnegative(),
  // Billing identity snapshot copied from the order (denormalized).
  billingName: z.string().min(1).optional(),
  billingAddress: billingAddressSchema.optional(),
  metadata: metadataSchema.optional(),
  createdAt: z.string().min(1),
  issuedAt: z.string().min(1).optional(),
});

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
