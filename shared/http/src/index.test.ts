import { afterEach, describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { z } from "zod";
import { createHttpClient, HttpError } from "./index";

const originalFetch = globalThis.fetch;

const stubFetch = (impl: (request: Request) => Response | Promise<Response>): void => {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(impl(new Request(input, init)))) as typeof fetch;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createHttpClient", () => {
  it("constructs a client exposing request", () => {
    const client = createHttpClient({ prefix: "https://example.test" });

    expect(typeof client.request).toBe("function");
  });

  it("parses and validates a matching JSON response", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ id: "ord_1", amount: 1000 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const client = createHttpClient({ prefix: "https://example.test" });
    const schema = z.object({ id: z.string(), amount: z.number().int() });

    const result = await client.request({
      method: "GET",
      path: "orders/ord_1",
      schema,
    });

    expect(Result.isOk(result)).toBe(true);

    if (Result.isOk(result)) {
      expect(result.value).toEqual({ id: "ord_1", amount: 1000 });
    }
  });

  it("returns an HttpError when the response fails schema validation", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ unexpected: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const client = createHttpClient({ prefix: "https://example.test" });
    // never-matching schema: response shape can never satisfy it.
    const neverSchema = z.object({ required: z.string() });

    const result = await client.request({
      method: "GET",
      path: "never",
      schema: neverSchema,
    });

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error).toBeInstanceOf(HttpError);
      expect(result.error.message).toBe("Resposta HTTP não respeita o contrato esperado.");
      expect(result.error.status).toBe(200);
    }
  });

  it("captures the status code when the server rejects the request", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: "nope" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    );

    const client = createHttpClient({ prefix: "https://example.test", retry: 0 });
    const schema = z.object({ ok: z.boolean() });

    const result = await client.request({
      method: "GET",
      path: "missing",
      schema,
    });

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error).toBeInstanceOf(HttpError);
      expect(result.error.status).toBe(404);
    }
  });
});
