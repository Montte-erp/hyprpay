import { Effect, Schema } from "effect";
import { invalidInput, type HyprPayError } from "../errors";

const positiveIntSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const optionalUrlString = Schema.String.pipe(Schema.optionalKey);

export const portalSessionInputSchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  returnUrl: optionalUrlString,
  expiresInSeconds: positiveIntSchema.pipe(Schema.optionalKey),
});

export type PortalSessionInput = Schema.Schema.Type<typeof portalSessionInputSchema>;

export const decodePortalSessionInput = (input: PortalSessionInput): Effect.Effect<PortalSessionInput, HyprPayError> =>
  Schema.decodeUnknownEffect(portalSessionInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));
