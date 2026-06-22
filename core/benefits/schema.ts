import { Effect, Schema } from "effect";
import { invalidInput, type HyprPayError } from "../errors";

const optionalMetadata = Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optionalKey);
const optionalNonEmptyString = Schema.NonEmptyString.pipe(Schema.optionalKey);
const benefitTypeSchema = Schema.Literals([
  "feature_flag",
  "meter_credits",
  "license_key",
  "file_download",
  "github_repository",
  "discord_role",
  "slack_channel",
  "seats",
  "custom",
]);

export const benefitGrantInputSchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  benefitId: Schema.NonEmptyString,
  type: benefitTypeSchema,
  sourceId: optionalNonEmptyString,
  expiresAt: optionalNonEmptyString,
  metadata: optionalMetadata,
});

export const benefitRevokeInputSchema = Schema.Struct({
  grantId: Schema.NonEmptyString,
});

export type BenefitGrantInput = Schema.Schema.Type<typeof benefitGrantInputSchema>;
export type BenefitRevokeInput = Schema.Schema.Type<typeof benefitRevokeInputSchema>;

export const decodeBenefitGrantInput = (input: BenefitGrantInput): Effect.Effect<BenefitGrantInput, HyprPayError> =>
  Schema.decodeUnknownEffect(benefitGrantInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeBenefitRevokeInput = (input: BenefitRevokeInput): Effect.Effect<BenefitRevokeInput, HyprPayError> =>
  Schema.decodeUnknownEffect(benefitRevokeInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));
