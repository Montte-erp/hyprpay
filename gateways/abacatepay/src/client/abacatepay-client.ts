import { Result } from "better-result";
import { createHttpClient, type HttpClient, type HttpError } from "@hyprpay/http";
import type { z } from "zod";
import type { AbacatePayEnvelope } from "../contracts/abacatepay-response-schema";
import { abacatePayAdapterOptionsSchema, type AbacatePayAdapterOptions } from "../abacatepay-env";
import {
  abacatePayRequestError,
  invalidAbacatePayConfig,
  type BillingResult,
} from "../errors/abacatepay-errors";
import { resolveAbacatePayBaseUrl } from "./abacatepay-endpoints";

export interface AbacatePayClient {
  post<TData>(
    path: string,
    body: Record<string, unknown>,
    schema: z.ZodType<AbacatePayEnvelope<TData>>,
  ): Promise<BillingResult<AbacatePayEnvelope<TData>>>;
}

const ABACATEPAY_TIMEOUT_MS = 30_000;

/**
 * Translates an {@link HttpError} from `@hyprpay/http` into the AbacatePay
 * provider {@link BillingError}, preserving the upstream HTTP status when known.
 */
const toBillingError = (error: HttpError) =>
  error.status === undefined
    ? abacatePayRequestError(error.message)
    : abacatePayRequestError(error.message, error.status);

export const createAbacatePayClient = (
  input: AbacatePayAdapterOptions,
): BillingResult<AbacatePayClient> => {
  const parsed = abacatePayAdapterOptionsSchema.safeParse(input);

  if (!parsed.success) {
    return Result.err(invalidAbacatePayConfig());
  }

  const httpClient: HttpClient = createHttpClient({
    prefix: resolveAbacatePayBaseUrl(parsed.data.environment),
    headers: {
      Authorization: `Bearer ${parsed.data.apiKey}`,
      "Content-Type": "application/json",
    },
    retry: 0,
    timeoutMs: ABACATEPAY_TIMEOUT_MS,
  });

  return Result.ok({
    post: async <TData>(
      path: string,
      body: Record<string, unknown>,
      schema: z.ZodType<AbacatePayEnvelope<TData>>,
    ): Promise<BillingResult<AbacatePayEnvelope<TData>>> => {
      const responseResult = await httpClient.request({
        method: "POST",
        path,
        body,
        schema,
      });

      if (Result.isError(responseResult)) {
        return Result.err(toBillingError(responseResult.error));
      }

      const envelope = responseResult.value;

      if (!envelope.success) {
        return Result.err(
          abacatePayRequestError(
            envelope.error ?? "A AbacatePay respondeu com erro desconhecido.",
          ),
        );
      }

      return Result.ok(envelope);
    },
  });
};
