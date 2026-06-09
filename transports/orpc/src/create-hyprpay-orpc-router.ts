import { catalogRouter } from "./routers/catalog-router";
import { checkoutsRouter } from "./routers/checkouts-router";
import { customersRouter } from "./routers/customers-router";
import { discountsRouter } from "./routers/discounts-router";
import { entitlementsRouter } from "./routers/entitlements-router";
import { metersRouter } from "./routers/meters-router";
import { ordersRouter } from "./routers/orders-router";
import { refundsRouter } from "./routers/refunds-router";
import { seatsRouter } from "./routers/seats-router";
import { subscriptionsRouter } from "./routers/subscriptions-router";

/**
 * Composes every billing router into a single oRPC router. Procedures are
 * grouped by namespace (`catalog`, `customers`, …) and each declares its own
 * explicit `method` + `path` under `/billing/...`.
 *
 * All procedures run on the base `billingProcedure` — the library ships the
 * billing primitives and does NOT enforce auth on routes. Auth building blocks
 * (`authedProcedure`, `customerProcedure`, `verifyToken`) are exported from
 * index.ts for the host to wrap routes as it sees fit.
 *
 * Webhooks are intentionally absent — they stay raw (see index.ts).
 */
export const createHyprPayOrpcRouter = () => ({
  catalog: catalogRouter,
  customers: customersRouter,
  checkouts: checkoutsRouter,
  subscriptions: subscriptionsRouter,
  orders: ordersRouter,
  refunds: refundsRouter,
  meters: metersRouter,
  discounts: discountsRouter,
  entitlements: entitlementsRouter,
  seats: seatsRouter,
});

export type HyprPayOrpcRouter = ReturnType<typeof createHyprPayOrpcRouter>;
