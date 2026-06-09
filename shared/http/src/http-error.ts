import { TaggedError } from "better-result";

export class HttpError extends TaggedError("HttpError")<{
  message: string;
  status?: number;
  cause?: unknown;
}>() {}

export interface HttpErrorInput {
  message: string;
  status?: number;
  cause?: unknown;
}

/**
 * Builds an {@link HttpError} while respecting `exactOptionalPropertyTypes`:
 * `status`/`cause` are only attached when defined so we never assign explicit
 * `undefined` to an omitted optional property.
 */
export const createHttpError = (input: HttpErrorInput): HttpError => {
  const payload: { message: string; status?: number; cause?: unknown } = {
    message: input.message,
  };

  if (input.status !== undefined) {
    payload.status = input.status;
  }

  if (input.cause !== undefined) {
    payload.cause = input.cause;
  }

  return new HttpError(payload);
};
