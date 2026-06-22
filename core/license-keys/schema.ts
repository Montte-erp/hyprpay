import { Effect, Schema } from "effect";
import { invalidInput, type HyprPayError } from "../errors";
import type { LicenseKey, LicenseKeyActivation } from "../schemas";

const nonNegativeIntSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const optionalMetadata = Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optionalKey);
const optionalNonEmptyString = Schema.NonEmptyString.pipe(Schema.optionalKey);

export const licenseKeyIssueInputSchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  benefitId: optionalNonEmptyString,
  prefix: optionalNonEmptyString,
  key: optionalNonEmptyString,
  activationsLimit: nonNegativeIntSchema.pipe(Schema.optionalKey),
  usageLimit: nonNegativeIntSchema.pipe(Schema.optionalKey),
  expiresAt: optionalNonEmptyString,
  metadata: optionalMetadata,
});

export const licenseKeyValidateInputSchema = Schema.Struct({
  key: Schema.NonEmptyString,
  activationId: optionalNonEmptyString,
  incrementUsage: nonNegativeIntSchema.pipe(Schema.optionalKey),
});

export const licenseKeyActivateInputSchema = Schema.Struct({
  key: Schema.NonEmptyString,
  instanceId: Schema.NonEmptyString,
  label: optionalNonEmptyString,
  metadata: optionalMetadata,
});

export const licenseKeyDeactivateInputSchema = Schema.Struct({
  activationId: Schema.NonEmptyString,
});

export interface LicenseKeyValidationResult {
  readonly valid: boolean;
  readonly licenseKey?: LicenseKey;
  readonly activation?: LicenseKeyActivation;
  readonly reason?: "not_found" | "revoked" | "expired" | "activation_required" | "usage_limit_reached";
}

export type LicenseKeyIssueInput = Schema.Schema.Type<typeof licenseKeyIssueInputSchema>;
export type LicenseKeyValidateInput = Schema.Schema.Type<typeof licenseKeyValidateInputSchema>;
export type LicenseKeyActivateInput = Schema.Schema.Type<typeof licenseKeyActivateInputSchema>;
export type LicenseKeyDeactivateInput = Schema.Schema.Type<typeof licenseKeyDeactivateInputSchema>;

export const decodeLicenseKeyIssueInput = (
  input: LicenseKeyIssueInput,
): Effect.Effect<LicenseKeyIssueInput, HyprPayError> =>
  Schema.decodeUnknownEffect(licenseKeyIssueInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeLicenseKeyValidateInput = (
  input: LicenseKeyValidateInput,
): Effect.Effect<LicenseKeyValidateInput, HyprPayError> =>
  Schema.decodeUnknownEffect(licenseKeyValidateInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeLicenseKeyActivateInput = (
  input: LicenseKeyActivateInput,
): Effect.Effect<LicenseKeyActivateInput, HyprPayError> =>
  Schema.decodeUnknownEffect(licenseKeyActivateInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeLicenseKeyDeactivateInput = (
  input: LicenseKeyDeactivateInput,
): Effect.Effect<LicenseKeyDeactivateInput, HyprPayError> =>
  Schema.decodeUnknownEffect(licenseKeyDeactivateInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));
