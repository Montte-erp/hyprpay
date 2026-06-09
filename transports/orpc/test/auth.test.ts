import { describe, expect, it } from "bun:test";
import { ORPCError, call } from "@orpc/server";
import { z } from "zod";
import {
  deriveAuthPrincipal,
  readBearerToken,
} from "../src/context";
import type {
  AuthPrincipal,
  HyprPayBillingApi,
  HyprPayOrpcContext,
  HyprPayVerifyToken,
} from "../src/context";
import {
  authedProcedure,
  customerProcedure,
  publicProcedure,
} from "../src/procedure";

/**
 * The auth building blocks never touch the billing api, so a bare cast is
 * enough context plumbing for these tests.
 */
const fakeApi = {} as HyprPayBillingApi;

const orgPrincipal: AuthPrincipal = {
  kind: "organization",
  subject: "org_secret_key",
  organizationId: "org_1",
};

const customerPrincipal: AuthPrincipal = {
  kind: "customer",
  subject: "cust_token",
  customerId: "cus_123",
};

/**
 * Builds a verifier that maps known tokens to principals; everything else is
 * denied (returns null).
 */
const verifierFor = (
  table: Record<string, AuthPrincipal>,
): HyprPayVerifyToken => token => table[token] ?? null;

const ctx = (overrides: Partial<HyprPayOrpcContext>): HyprPayOrpcContext => ({
  api: fakeApi,
  ...overrides,
});

// A trivial authed procedure that echoes the resolved principal.
const whoami = authedProcedure
  .route({ method: "GET", path: "/billing/whoami" })
  .handler(({ context }) => context.principal);

// A customer-scoped procedure that echoes the pinned customer id.
const customerEcho = customerProcedure
  .route({ method: "POST", path: "/billing/customer-echo" })
  .input(z.object({ customerId: z.string().optional() }))
  .handler(({ context }) => context.customerId);

// A public (webhook-style) procedure that needs no token.
const ping = publicProcedure
  .route({ method: "POST", path: "/billing/ping" })
  .handler(() => "pong");

describe("readBearerToken", () => {
  it("reads the token from a Headers instance", () => {
    const headers = new Headers({ Authorization: "Bearer abc.def" });
    expect(readBearerToken(headers)).toBe("abc.def");
  });

  it("is case-insensitive on the header name and the Bearer scheme", () => {
    const headers = { authorization: "bearer XYZ" };
    expect(readBearerToken(headers)).toBe("XYZ");
  });

  it("reads the first value of an array-valued header record", () => {
    const headers = { Authorization: ["Bearer first", "Bearer second"] };
    expect(readBearerToken(headers)).toBe("first");
  });

  it("returns null when the header is missing", () => {
    expect(readBearerToken({})).toBeNull();
    expect(readBearerToken(undefined)).toBeNull();
  });

  it("returns null for a non-Bearer scheme or empty token", () => {
    expect(readBearerToken({ authorization: "Basic abc" })).toBeNull();
    expect(readBearerToken({ authorization: "Bearer    " })).toBeNull();
    expect(readBearerToken({ authorization: "Bearer" })).toBeNull();
  });
});

describe("deriveAuthPrincipal", () => {
  it("resolves a principal via the configured verifier", async () => {
    const principal = await deriveAuthPrincipal({
      headers: { authorization: "Bearer secret" },
      verifyToken: verifierFor({ secret: orgPrincipal }),
    });

    expect(principal).toEqual(orgPrincipal);
  });

  it("default-denies when no verifier is configured", async () => {
    const principal = await deriveAuthPrincipal({
      headers: { authorization: "Bearer secret" },
    });

    expect(principal).toBeNull();
  });

  it("denies when the token is absent", async () => {
    const principal = await deriveAuthPrincipal({
      verifyToken: verifierFor({ secret: orgPrincipal }),
    });

    expect(principal).toBeNull();
  });

  it("denies when the verifier rejects the token", async () => {
    const principal = await deriveAuthPrincipal({
      headers: { authorization: "Bearer unknown" },
      verifyToken: verifierFor({ secret: orgPrincipal }),
    });

    expect(principal).toBeNull();
  });

  it("supports async verifiers", async () => {
    const principal = await deriveAuthPrincipal({
      headers: { authorization: "Bearer secret" },
      verifyToken: async token =>
        token === "secret" ? orgPrincipal : null,
    });

    expect(principal).toEqual(orgPrincipal);
  });
});

describe("authedProcedure", () => {
  it("passes a valid organization token and exposes the principal", async () => {
    const principal = await call(
      whoami,
      {},
      {
        context: ctx({
          headers: { authorization: "Bearer secret" },
          verifyToken: verifierFor({ secret: orgPrincipal }),
        }),
      },
    );

    expect(principal).toEqual(orgPrincipal);
  });

  it("rejects with a 401 ORPCError when no token is present", async () => {
    const error = await call(
      whoami,
      {},
      { context: ctx({ verifyToken: verifierFor({ secret: orgPrincipal }) }) },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).status).toBe(401);
  });

  it("rejects with a 401 ORPCError when no verifier is configured (default-deny)", async () => {
    const error = await call(
      whoami,
      {},
      { context: ctx({ headers: { authorization: "Bearer secret" } }) },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).status).toBe(401);
  });

  it("rejects an unknown token", async () => {
    const error = await call(
      whoami,
      {},
      {
        context: ctx({
          headers: { authorization: "Bearer nope" },
          verifyToken: verifierFor({ secret: orgPrincipal }),
        }),
      },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).status).toBe(401);
  });
});

describe("customerProcedure", () => {
  it("pins the customer id for a customer-scoped token", async () => {
    const pinned = await call(
      customerEcho,
      {},
      {
        context: ctx({
          headers: { authorization: "Bearer cust" },
          verifyToken: verifierFor({ cust: customerPrincipal }),
        }),
      },
    );

    expect(pinned).toBe("cus_123");
  });

  it("allows a customer token to address its own customer explicitly", async () => {
    const pinned = await call(
      customerEcho,
      { customerId: "cus_123" },
      {
        context: ctx({
          headers: { authorization: "Bearer cust" },
          verifyToken: verifierFor({ cust: customerPrincipal }),
        }),
      },
    );

    expect(pinned).toBe("cus_123");
  });

  it("rejects a customer token reaching another customer", async () => {
    const error = await call(
      customerEcho,
      { customerId: "cus_999" },
      {
        context: ctx({
          headers: { authorization: "Bearer cust" },
          verifyToken: verifierFor({ cust: customerPrincipal }),
        }),
      },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).status).toBe(401);
  });

  it("lets an organization token act on the requested customer (full access)", async () => {
    const pinned = await call(
      customerEcho,
      { customerId: "cus_555" },
      {
        context: ctx({
          headers: { authorization: "Bearer secret" },
          verifyToken: verifierFor({ secret: orgPrincipal }),
        }),
      },
    );

    expect(pinned).toBe("cus_555");
  });

  it("still enforces authentication before pinning", async () => {
    const error = await call(
      customerEcho,
      { customerId: "cus_123" },
      { context: ctx({ verifyToken: verifierFor({ cust: customerPrincipal }) }) },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).status).toBe(401);
  });
});

describe("publicProcedure", () => {
  it("runs without any token (webhook surface)", async () => {
    const result = await call(ping, {}, { context: ctx({}) });
    expect(result).toBe("pong");
  });
});
