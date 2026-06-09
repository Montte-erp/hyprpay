import { z } from "zod";
import { billingAddressSchema, documentTypeSchema, metadataSchema } from "./shared-schema";

export const customerInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  document: z.string().min(11).max(14),
  externalId: z.string().min(1).optional(),
  phone: z.string().optional(),
  /**
   * Fiscal tax identifier (e.g. Inscrição Estadual / Municipal). Distinct from
   * `document` (CPF/CNPJ), which remains the primary fiscal document.
   */
  taxId: z.string().min(1).optional(),
  billingAddress: billingAddressSchema.optional(),
  metadata: metadataSchema.optional(),
});

export const customerSchema = customerInputSchema.extend({
  id: z.string().min(1),
  providerCustomerId: z.string().optional(),
  documentType: documentTypeSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  deletedAt: z.string().min(1).optional(),
});

/**
 * PATCH-style update payload. Every field is optional so callers can patch a
 * single attribute; identity fields (`id`, `documentType`, timestamps) are not
 * patchable here. Updating `document` re-derives `documentType` in the plugin.
 */
export const customerUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    document: z.string().min(11).max(14).optional(),
    externalId: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    taxId: z.string().min(1).optional(),
    billingAddress: billingAddressSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const customerListFilterSchema = z.object({
  /** Free-text search across name/email/document. */
  search: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
  /** Include soft-deleted customers in the result. Defaults to false. */
  includeDeleted: z.boolean().default(false),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;
/** Resolved filter (defaults applied) handed to the database adapter. */
export type CustomerListFilter = z.infer<typeof customerListFilterSchema>;
/** Caller-facing filter where defaulted fields may be omitted. */
export type CustomerListFilterInput = z.input<typeof customerListFilterSchema>;
export type BillingAddress = z.infer<typeof billingAddressSchema>;
