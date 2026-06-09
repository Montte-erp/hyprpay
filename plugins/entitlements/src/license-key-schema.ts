import { z } from "zod";
import { metadataSchema } from "./benefit-schema";

/**
 * License-key benefit. License keys are issued against a benefit + customer,
 * carry a deterministic activation lifecycle (activate up to a cap, revoke),
 * and can optionally expire. Key material is generated with `crypto` — never a
 * predictable counter.
 */
export const licenseKeyStatusSchema = z.enum(["active", "revoked", "expired"]);

export const licenseKeyIssueInputSchema = z.object({
  benefitId: z.string().min(1),
  customerId: z.string().min(1),
  // max number of activations; omit for unlimited.
  activationLimit: z.number().int().positive().optional(),
  // absolute expiry as ISO string; omit for no expiry.
  expiresAt: z.string().min(1).optional(),
  metadata: metadataSchema.optional(),
});

export const licenseKeyValidateInputSchema = z.object({
  key: z.string().min(1),
});

export const licenseKeyActivateInputSchema = z.object({
  key: z.string().min(1),
  // optional opaque label for the activation (device id, hostname, ...).
  instanceLabel: z.string().min(1).optional(),
});

export const licenseKeyRevokeInputSchema = z.object({
  key: z.string().min(1),
});

export const licenseKeySchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  benefitId: z.string().min(1),
  customerId: z.string().min(1),
  status: licenseKeyStatusSchema,
  activationLimit: z.number().int().positive().optional(),
  activationCount: z.number().int().nonnegative(),
  expiresAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  revokedAt: z.string().min(1).optional(),
  metadata: metadataSchema.optional(),
});

export const licenseKeyValidationSchema = z.object({
  valid: z.boolean(),
  key: z.string().min(1),
  status: licenseKeyStatusSchema,
  activationLimit: z.number().int().positive().optional(),
  activationCount: z.number().int().nonnegative(),
  remainingActivations: z.number().int().nonnegative().optional(),
  expiresAt: z.string().min(1).optional(),
});

export type LicenseKeyStatus = z.infer<typeof licenseKeyStatusSchema>;
export type LicenseKeyIssueInput = z.infer<typeof licenseKeyIssueInputSchema>;
export type LicenseKeyValidateInput = z.infer<typeof licenseKeyValidateInputSchema>;
export type LicenseKeyActivateInput = z.infer<typeof licenseKeyActivateInputSchema>;
export type LicenseKeyRevokeInput = z.infer<typeof licenseKeyRevokeInputSchema>;
export type LicenseKey = z.infer<typeof licenseKeySchema>;
export type LicenseKeyValidation = z.infer<typeof licenseKeyValidationSchema>;
