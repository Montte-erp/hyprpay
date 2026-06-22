import { Effect, Schema } from "effect";
import type { ResetInterval } from "../catalog";
import { invalidInput, type HyprPayError } from "../errors";

export interface EntitlementBalance {
  readonly limit: number;
  readonly remaining: number;
  readonly reset: ResetInterval;
  readonly unlimited: boolean;
}

const positiveIntSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

export const entitlementCheckInputSchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  featureId: Schema.NonEmptyString,
  amount: positiveIntSchema.pipe(Schema.optionalKey),
});

export const entitlementReportInputSchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  featureId: Schema.NonEmptyString,
  amount: positiveIntSchema.pipe(Schema.optionalKey),
  idempotencyKey: Schema.NonEmptyString.pipe(Schema.optionalKey),
});

export interface EntitlementCheckInput<TFeatureId extends string = string> {
  readonly customerId: string;
  readonly featureId: TFeatureId;
  readonly amount?: number;
}

export interface EntitlementCheckResult {
  readonly allowed: boolean;
  readonly balance?: EntitlementBalance;
  readonly reason?: "feature_not_granted" | "usage_limit_reached";
}

export interface EntitlementReportInput<TFeatureId extends string = string> extends EntitlementCheckInput<TFeatureId> {
  readonly idempotencyKey?: string;
}

export interface EntitlementReportResult extends EntitlementCheckResult {
  readonly success: boolean;
}

export const decodeEntitlementCheckInput = (
  input: EntitlementCheckInput,
): Effect.Effect<EntitlementCheckInput, HyprPayError> =>
  Schema.decodeUnknownEffect(entitlementCheckInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeEntitlementReportInput = (
  input: EntitlementReportInput,
): Effect.Effect<EntitlementReportInput, HyprPayError> =>
  Schema.decodeUnknownEffect(entitlementReportInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));
