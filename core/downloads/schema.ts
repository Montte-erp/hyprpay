import { Effect, Schema } from "effect";
import { invalidInput, type HyprPayError } from "../errors";

export const downloadAccessInputSchema = Schema.Struct({
  customerId: Schema.NonEmptyString,
  benefitId: Schema.NonEmptyString,
});

export interface DownloadAccessResult {
  readonly allowed: boolean;
  readonly benefitId: string;
  readonly fileId?: string;
  readonly url?: string;
  readonly reason?: "benefit_not_granted" | "benefit_not_downloadable";
}

export type DownloadAccessInput = Schema.Schema.Type<typeof downloadAccessInputSchema>;

export const decodeDownloadAccessInput = (input: DownloadAccessInput): Effect.Effect<DownloadAccessInput, HyprPayError> =>
  Schema.decodeUnknownEffect(downloadAccessInputSchema)(input).pipe(Effect.mapError(() => invalidInput()));
