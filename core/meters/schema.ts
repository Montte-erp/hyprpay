import { Effect, Schema } from "effect";
import { invalidInput, type HyprPayError } from "../errors";

const positiveIntSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const optionalMetadata = Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optionalKey);
const optionalNonEmptyString = Schema.NonEmptyString.pipe(Schema.optionalKey);

export const meterRecordInputSchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  meterId: Schema.NonEmptyString,
  amount: positiveIntSchema.pipe(Schema.optionalKey),
  idempotencyKey: optionalNonEmptyString,
  metadata: optionalMetadata,
});

export const meterSummaryInputSchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  meterId: Schema.NonEmptyString,
});

export interface MeterSummaryResult {
  readonly customerId: string;
  readonly meterId: string;
  readonly amount: number;
}

export type MeterRecordInput = Schema.Schema.Type<typeof meterRecordInputSchema>;
export type MeterSummaryInput = Schema.Schema.Type<typeof meterSummaryInputSchema>;

export const decodeMeterRecordInput = (input: MeterRecordInput): Effect.Effect<MeterRecordInput, HyprPayError> =>
  Schema.decodeUnknownEffect(meterRecordInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeMeterSummaryInput = (input: MeterSummaryInput): Effect.Effect<MeterSummaryInput, HyprPayError> =>
  Schema.decodeUnknownEffect(meterSummaryInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));
