// @hyprpay/orpc — oRPC transport for the HyprPay billing api (SPEC §13).
//
// This package exposes the composed `hyprpay.api` surface over HTTP via oRPC +
// OpenAPI. Every procedure validates its input with the plugin's own zod
// schema, calls `hyprpay.api.<ns>.<op>`, and `unwrap`s the `BillingResult` —
// a `Result` is NEVER serialized to the client.
//
// WEBHOOKS STAY RAW: provider webhooks are signature-verified raw HTTP and are
// intentionally NOT routed through oRPC. Mount the HyprPay core `handler`
// (which carries plugin routes, incl. webhooks) separately from this transport.

export { createHyprPayOrpcRouter } from "./create-hyprpay-orpc-router";
export type { HyprPayOrpcRouter } from "./create-hyprpay-orpc-router";

export { createHyprPayOpenAPIHandler } from "./create-hyprpay-openapi-handler";
export type { HyprPayOpenAPIHandler } from "./create-hyprpay-openapi-handler";

export { unwrap } from "./error/billing-result-to-orpc-error";

export {
  billingProcedure,
  publicProcedure,
  authedProcedure,
  customerProcedure,
} from "./procedure";

export { deriveAuthPrincipal, readBearerToken } from "./context";

export type {
  HyprPayBillingApi,
  HyprPayOrpcContext,
  HyprPayAuthOptions,
  HyprPayAuthedContext,
  HyprPayCustomerContext,
  HyprPayVerifyToken,
  AuthPrincipal,
  AuthPrincipalKind,
} from "./context";

export { catalogRouter } from "./routers/catalog-router";
export { customersRouter } from "./routers/customers-router";
export { checkoutsRouter } from "./routers/checkouts-router";
export { subscriptionsRouter } from "./routers/subscriptions-router";
export { ordersRouter } from "./routers/orders-router";
export { refundsRouter } from "./routers/refunds-router";
export { metersRouter } from "./routers/meters-router";
export { discountsRouter } from "./routers/discounts-router";
export { entitlementsRouter } from "./routers/entitlements-router";
export { seatsRouter } from "./routers/seats-router";
