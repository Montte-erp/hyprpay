import { Effect, Schema } from "effect";
import { invalidInput, type HyprPayError } from "../errors";

const optionalMetadata = Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optionalKey);
const optionalNonEmptyString = Schema.NonEmptyString.pipe(Schema.optionalKey);

export const seatAssignInputSchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  subscriptionId: optionalNonEmptyString,
  memberId: Schema.NonEmptyString,
  email: optionalNonEmptyString,
  metadata: optionalMetadata,
});

export const seatRevokeInputSchema = Schema.Struct({
  seatId: Schema.NonEmptyString,
});

export type SeatAssignInput = Schema.Schema.Type<typeof seatAssignInputSchema>;
export type SeatRevokeInput = Schema.Schema.Type<typeof seatRevokeInputSchema>;

export const decodeSeatAssignInput = (input: SeatAssignInput): Effect.Effect<SeatAssignInput, HyprPayError> =>
  Schema.decodeUnknownEffect(seatAssignInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));

export const decodeSeatRevokeInput = (input: SeatRevokeInput): Effect.Effect<SeatRevokeInput, HyprPayError> =>
  Schema.decodeUnknownEffect(seatRevokeInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));
