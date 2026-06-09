import type { CatalogApi } from "@hyprpay/catalog";
import type { CheckoutsApi } from "@hyprpay/checkouts";
import type {
  CustomersApi,
  CustomerStateWatcher,
} from "@hyprpay/customers";
import type { DiscountsApi } from "@hyprpay/discounts";
import type { EntitlementsApi } from "@hyprpay/entitlements";
import type { MetersApi } from "@hyprpay/meters";
import type { OrdersApi } from "@hyprpay/orders";
import type { RefundsApi } from "@hyprpay/refunds";
import type { SeatsApi } from "@hyprpay/seats";
import type { SubscriptionsApi } from "@hyprpay/subscriptions";

/**
 * The subset of the composed `hyprpay.api` surface this transport exposes over
 * HTTP. Each namespace mirrors the api a plugin contributes via
 * `extendApi` (see `core/core/src/contracts/hyprpay-plugin.ts`).
 *
 * Wire it from a typed `createHyprPay({ plugins: [...] })` instance: pass
 * `hyprpay.api` as the orpc context.
 */
export interface HyprPayBillingApi {
  catalog: CatalogApi;
  customers: CustomersApi;
  checkouts: CheckoutsApi;
  subscriptions: SubscriptionsApi;
  orders: OrdersApi;
  refunds: RefundsApi;
  meters: MetersApi;
  discounts: DiscountsApi;
  entitlements: EntitlementsApi;
  seats: SeatsApi;
}

/**
 * The kind of bearer token presented on the request.
 *
 * - `organization`: an organization/secret API token. Grants full access to
 *   every billing operation across every customer of the org.
 * - `customer`: a customer-scoped token. The principal is restricted to the
 *   single `customerId` it was minted for; `customerProcedure` pins it onto the
 *   context so handlers operate on exactly that customer.
 */
export type AuthPrincipalKind = "organization" | "customer";

/**
 * The authenticated principal derived from the request's bearer token. The host
 * supplies the verification strategy (see {@link HyprPayVerifyToken}); this
 * transport only consumes the resolved principal.
 *
 * `organizationId` is optional so a host that does not model organizations can
 * still mint full-access secret tokens. `customerId` is REQUIRED for the
 * `customer` kind and forbidden for the `organization` kind — encode that with
 * the discriminated union below rather than this loose shape.
 */
export type AuthPrincipal =
  | {
      kind: "organization";
      /** Stable id of the token holder (org id, key id, …) for auditing. */
      subject: string;
      organizationId?: string;
      /** Optional free-form scopes the host may attach; not enforced here. */
      scopes?: readonly string[];
    }
  | {
      kind: "customer";
      subject: string;
      /** The single customer this token is scoped to. */
      customerId: string;
      organizationId?: string;
      scopes?: readonly string[];
    };

/**
 * Host-supplied token verifier. Receives the raw bearer token (the value after
 * `Bearer `) and returns the resolved {@link AuthPrincipal}, or `null` to deny.
 *
 * May be sync or async. When NO verifier is configured on the context the
 * transport DENIES by default — there is no implicit trust.
 */
export type HyprPayVerifyToken = (token: string) => AuthPrincipal | null | Promise<AuthPrincipal | null>;

/**
 * Request-scoped inputs the auth middleware reads to derive a principal. The
 * composition root populates these per request from the incoming HTTP request.
 *
 * `headers` accepts either a Web `Headers` instance or a plain record (case is
 * normalized when reading `authorization`), so it works across both the fetch
 * and node oRPC runtimes.
 */
export interface HyprPayAuthOptions {
  /** Incoming request headers; `Authorization: Bearer <token>` is read from here. */
  headers?: Headers | Record<string, string | string[] | undefined>;
  /**
   * Pluggable token verification strategy. When omitted, every authed
   * procedure denies (default-deny).
   */
  verifyToken?: HyprPayVerifyToken;
}

/**
 * oRPC context carried through every procedure. The composition root supplies
 * the typed billing api as `context.api`, plus the request-scoped auth inputs
 * (`headers` + `verifyToken`) the auth middleware consumes.
 */
export interface HyprPayOrpcContext extends HyprPayAuthOptions {
  api: HyprPayBillingApi;
  /**
   * Customer-state aggregator (composed by the integration from the read apis +
   * runtime via `@hyprpay/customers`' `createCustomerStateWatcher`). Surfaced on
   * the customers router as a customer-scoped read; emits
   * `billing.customer.state_changed` when a snapshot changes. Optional so a host
   * that does not wire it can still mount the rest of the transport.
   */
  getCustomerState?: CustomerStateWatcher;
}

/**
 * Context after `authedProcedure`'s middleware has run: the resolved principal
 * is guaranteed present.
 */
export interface HyprPayAuthedContext extends HyprPayOrpcContext {
  principal: AuthPrincipal;
}

/**
 * Context after `customerProcedure`'s middleware has run: a customer id is
 * pinned. For a `customer` principal it is the token's own customer; for an
 * `organization` principal it is left to the handler input (the org may act on
 * any customer) — see `customerProcedure` for how it is resolved.
 */
export interface HyprPayCustomerContext extends HyprPayAuthedContext {
  customerId: string;
}

/**
 * Reads the raw bearer token from the request headers, supporting both a Web
 * `Headers` instance and a plain record. Returns `null` when absent or
 * malformed (missing `Bearer ` prefix / empty token).
 */
export const readBearerToken = (
  headers: HyprPayAuthOptions["headers"],
): string | null => {
  if (headers === undefined) {
    return null;
  }

  let raw: string | undefined;

  if (headers instanceof Headers) {
    raw = headers.get("authorization") ?? undefined;
  } else {
    // Plain record: header names are case-insensitive per RFC 7230, so scan.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "authorization") {
        const value = headers[key];
        raw = Array.isArray(value) ? value[0] : value;
        break;
      }
    }
  }

  if (raw === undefined) {
    return null;
  }

  const match = /^Bearer[ ]+(.+)$/i.exec(raw.trim());
  const token = match?.[1]?.trim();

  if (token === undefined || token.length === 0) {
    return null;
  }

  return token;
};

/**
 * Derives the authenticated principal for a request: reads the bearer token and
 * runs the host-supplied verifier. Returns `null` (deny) when there is no
 * token, no verifier configured (default-deny), or the verifier rejects.
 */
export const deriveAuthPrincipal = async (
  context: HyprPayAuthOptions,
): Promise<AuthPrincipal | null> => {
  const token = readBearerToken(context.headers);

  if (token === null) {
    return null;
  }

  // Default-deny: with no verifier configured we trust nothing.
  if (context.verifyToken === undefined) {
    return null;
  }

  const principal = await context.verifyToken(token);

  return principal ?? null;
};
