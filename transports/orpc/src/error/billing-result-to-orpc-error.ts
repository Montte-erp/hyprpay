import { Result } from "better-result";
import type { Result as ResultType } from "better-result";
import { ORPCError } from "@orpc/server";

/**
 * Structural shape of every plugin's `BillingError` (see
 * each plugin's `core-errors.ts`. Each plugin owns a nominally
 * distinct `BillingError` class, but they are structurally identical — this
 * transport only needs the status/message, so we depend on the shape, not the
 * class. This keeps `unwrap` usable across every plugin api.
 */
interface BillingErrorShape {
  error: { status: number; message: string };
  message: string;
  status?: number;
}

/**
 * Any `Result<T, E>` whose error carries the billing error shape.
 */
type BillingResultLike<T> = ResultType<T, BillingErrorShape>;

/**
 * oRPC error codes are strings; HyprPay errors carry an HTTP `status` number.
 * Map the numeric status to the closest oRPC code while preserving the
 * original status on the thrown `ORPCError` so the OpenAPI handler emits the
 * intended HTTP code.
 */
const statusToOrpcCode = (status: number): string => {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "UNPROCESSABLE_CONTENT";
    case 429:
      return "TOO_MANY_REQUESTS";
    case 502:
    case 503:
    case 504:
      return "BAD_GATEWAY";
    default:
      return status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
  }
};

const toOrpcError = (error: BillingErrorShape) => {
  // SPEC §13: status = error.status ?? error.error.status
  const status = error.status ?? error.error.status;

  return new ORPCError(statusToOrpcCode(status), {
    status,
    message: error.message,
  });
};

/**
 * SPEC §13: unwrap a `BillingResult<T>` for transport. On error, throws an
 * `ORPCError` built from the billing error's status + message. Never serialize
 * a `Result` to the client — callers must `unwrap` first.
 */
export const unwrap = <T>(result: BillingResultLike<T>): T => {
  if (Result.isError(result)) {
    throw toOrpcError(result.error);
  }

  return result.value;
};
