import { BillingError } from "@hyprpay/catalog";
import { Result } from "better-result";
import { os } from "@orpc/server";
import type {
  AuthPrincipal,
  HyprPayOrpcContext,
} from "./context";
import { deriveAuthPrincipal } from "./context";
import { unwrap } from "./error/billing-result-to-orpc-error";

/**
 * Base oRPC builder bound to the HyprPay billing context. Routers extend this
 * with `.route(...)`, `.input(...)`, `.handler(...)`.
 *
 * The composition root provides `context.api` (a typed `hyprpay.api`) at
 * handler call time; see `create-hyprpay-openapi-handler.ts`.
 */
export const billingProcedure = os.$context<HyprPayOrpcContext>();

/**
 * Webhook / unauthenticated surface. Provider webhooks are signature-verified
 * raw HTTP and intentionally bypass token auth — use `publicProcedure` for any
 * orpc route that must NOT require a bearer token. It is the plain
 * `billingProcedure` with an explicit name so intent is legible at the call
 * site.
 */
export const publicProcedure = billingProcedure;

/**
 * The project unauthorized `BillingError`. There is no `UNAUTHORIZED` key in any
 * plugin's frozen error catalog (those are owned by other lanes and must not be
 * edited), so the transport constructs the 401 entry inline on the project's
 * own `BillingError` class. `unwrap` maps `error.status ?? error.error.status`
 * to a 401 `ORPCError`, so the client receives a proper HTTP 401.
 */
function unauthorized(message = "Não autorizado."): BillingError {
  return new BillingError({
    error: {
      status: 401,
      message,
      tags: ["hyprpay", "billing", "auth"],
    },
    message,
    status: 401,
  });
}

/**
 * Rejects the request with the project unauthorized `BillingError`, routed
 * through `unwrap` so the 401 → `ORPCError` mapping is identical to every
 * domain error. Declared as a `function` (not a const arrow) so TypeScript's
 * control-flow analysis narrows callers after it — a `never`-typed arrow does
 * not trigger that narrowing.
 */
function denyUnauthorized(message?: string): never {
  unwrap(Result.err(unauthorized(message)));
  // `unwrap` throws on an error result; this line is unreachable but keeps the
  // `never` return type honest for the type checker.
  throw unauthorized(message);
}

/**
 * Authenticated billing surface. Enforces a valid bearer-token principal before
 * the handler runs and augments the context with `principal`. Rejects with the
 * project unauthorized `BillingError` (HTTP 401) when no valid principal can be
 * derived — including the default-deny case where the host configured no
 * `verifyToken`.
 *
 * Routers build authed procedures from this, e.g.:
 *
 *   authedProcedure
 *     .route({ method: "GET", path: "/billing/orders/{id}" })
 *     .input(z.object({ id: z.string() }))
 *     .handler(async ({ context, input }) =>
 *       unwrap(await context.api.orders.get(input.id)));
 */
export const authedProcedure = billingProcedure.use(async ({ context, next }) => {
  const principal = await deriveAuthPrincipal(context);

  if (principal === null) {
    denyUnauthorized();
  }

  return next({ context: { principal } });
});

/**
 * Resolves the customer id a principal is allowed to act on.
 *
 * - `customer` principal: pinned to its own `customerId`. If the handler input
 *   names a DIFFERENT customer, access is denied (403-style 401 unauthorized).
 * - `organization` principal: full access. The customer id comes from the
 *   handler input when provided; otherwise the org is acting org-wide and the
 *   pin is left empty (handlers that require one should validate their input).
 */
const resolveCustomerId = (
  principal: AuthPrincipal,
  requestedCustomerId: string | undefined,
): string | null => {
  if (principal.kind === "customer") {
    if (
      requestedCustomerId !== undefined &&
      requestedCustomerId !== principal.customerId
    ) {
      // Customer token trying to reach another customer's data — deny.
      return null;
    }

    return principal.customerId;
  }

  // Organization principal: act on whatever customer the request names.
  return requestedCustomerId ?? null;
};

/**
 * Customer-scoped billing surface. Builds on `authedProcedure`, then pins
 * `context.customerId`:
 *
 * - For a `customer` token the pin is the token's own customer; a request that
 *   targets a different `customerId` (read from the validated input, if it
 *   carries one) is rejected as unauthorized.
 * - For an `organization` token the pin is taken from the request input's
 *   `customerId` (full access), and is required to be present.
 *
 * The middleware reads `input.customerId` defensively — it only constrains the
 * pin when the procedure's input actually carries one.
 */
export const customerProcedure = authedProcedure.use(async ({ context, next }, input) => {
  const requestedCustomerId =
    typeof input === "object" &&
    input !== null &&
    "customerId" in input &&
    typeof (input as { customerId: unknown }).customerId === "string"
      ? (input as { customerId: string }).customerId
      : undefined;

  const customerId = resolveCustomerId(context.principal, requestedCustomerId);

  if (customerId === null) {
    denyUnauthorized("Token sem permissão para acessar este cliente.");
  }

  return next({ context: { customerId } });
});
