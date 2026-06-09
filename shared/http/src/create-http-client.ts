import { Result } from "better-result";
import ky, { HTTPError, type KyInstance, type Options as KyOptions } from "ky";
import type { z } from "zod";
import { createHttpError, HttpError } from "./http-error";

export interface HttpClientOptions {
  prefix: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: number;
}

export interface RequestOptions<T> {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  searchParams?: Record<string, string>;
  schema: z.ZodType<T>;
  headers?: Record<string, string>;
}

export interface HttpClient {
  request<T>(opts: RequestOptions<T>): Promise<Result<T, HttpError>>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY = 0;

const resolveStatus = (cause: unknown): number | undefined => {
  if (cause instanceof HTTPError) {
    return cause.response.status;
  }

  return undefined;
};

export const createHttpClient = (options: HttpClientOptions): HttpClient => {
  const instanceOptions: KyOptions = {
    prefix: options.prefix,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retry: options.retry ?? DEFAULT_RETRY,
  };

  if (options.headers !== undefined) {
    instanceOptions.headers = options.headers;
  }

  const client: KyInstance = ky.create(instanceOptions);

  return {
    request: async <T>(opts: RequestOptions<T>): Promise<Result<T, HttpError>> => {
      const requestOptions: KyOptions = {
        method: opts.method,
      };

      if (opts.body !== undefined) {
        requestOptions.json = opts.body;
      }

      if (opts.searchParams !== undefined) {
        requestOptions.searchParams = opts.searchParams;
      }

      if (opts.headers !== undefined) {
        requestOptions.headers = opts.headers;
      }

      const responseResult = await Result.tryPromise({
        try: () => client(opts.path, requestOptions),
        catch: (cause): HttpError => {
          const status = resolveStatus(cause);

          return createHttpError(
            status === undefined
              ? { message: "Falha ao chamar o serviço HTTP.", cause }
              : { message: "O serviço HTTP recusou a requisição.", status, cause },
          );
        },
      });

      if (Result.isError(responseResult)) {
        return Result.err(responseResult.error);
      }

      const response = responseResult.value;

      const jsonResult = await Result.tryPromise({
        try: (): Promise<unknown> => response.json(),
        catch: (cause): HttpError =>
          createHttpError({
            message: "Resposta HTTP não é JSON válido.",
            status: response.status,
            cause,
          }),
      });

      if (Result.isError(jsonResult)) {
        return Result.err(jsonResult.error);
      }

      const parsed = opts.schema.safeParse(jsonResult.value);

      if (!parsed.success) {
        return Result.err(
          createHttpError({
            message: "Resposta HTTP não respeita o contrato esperado.",
            status: response.status,
            cause: parsed.error,
          }),
        );
      }

      return Result.ok(parsed.data);
    },
  };
};
