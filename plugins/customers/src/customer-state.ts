import { Result } from "better-result";
import type { HyprPayRuntime } from "@hyprpay/core";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type { Customer } from "./schemas/customer-schema";

/**
 * Customer-state aggregator (SPEC: composition of the read APIs each plugin lane
 * exposed). `getCustomerState` is a READ-ONLY composite over the per-domain read
 * apis — it never mutates. It is owned by the customers plugin (no new package)
 * and surfaced on the customers router as a customer-scoped read.
 *
 * Every collaborating domain is wired as a STRUCTURAL port (a subset of the
 * plugin's frozen `*Api`), so this module imports NO other plugin's internals —
 * it only depends on the shapes the lanes published. The integration passes the
 * composed `hyprpay.api.*` read methods straight in.
 */

/**
 * A subscription as the subscriptions lane exposes it. Only the fields the
 * aggregator reads are listed; the concrete `Subscription` is a structural
 * superset, so `hyprpay.api.subscriptions.list` results assign directly.
 */
export interface CustomerStateSubscription {
  id: string;
  customerId: string;
  status: string;
  priceId?: string;
}

/** An order as the orders lane exposes it. Structural subset of `Order`. */
export interface CustomerStateOrder {
  id: string;
  customerId: string;
  status: string;
  totalAmount: number;
  amountRefunded: number;
  currency: string;
  createdAt: string;
}

/** A granted entitlement / benefit projection for a customer. */
export interface CustomerStateEntitlement {
  feature: string;
  allowed: boolean;
  limit?: number;
  used: number;
  remaining?: number;
}

/** A meter credit balance projection for a customer. */
export interface CustomerStateMeterBalance {
  meterId: string;
  granted: number;
  consumed: number;
  balance: number;
}

/**
 * Read-only port over the subscriptions lane. Structural subset of
 * `SubscriptionsApi.list`.
 */
export interface CustomerStateSubscriptionsPort {
  list(filter: {
    customerId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<BillingResult<CustomerStateSubscription[]>>;
}

/** Read-only port over the orders lane. Structural subset of `OrdersApi.list`. */
export interface CustomerStateOrdersPort {
  list(filter: {
    customerId?: string;
    subscriptionId?: string;
  }): Promise<BillingResult<CustomerStateOrder[]>>;
}

/**
 * Optional read-only port that resolves a customer's granted entitlements /
 * benefits. The entitlements lane is keyed by (customerId, feature) and exposes
 * no customer-wide list, so the integration supplies a resolver (e.g. backed by
 * an index it owns). When absent, the aggregator reports an empty list.
 */
export interface CustomerStateEntitlementsPort {
  listByCustomer(customerId: string): Promise<BillingResult<CustomerStateEntitlement[]>>;
}

/**
 * Optional read-only port that resolves a customer's meter credit balances. The
 * meters lane reads a balance per (meterId, customerId); enumerating every meter
 * for a customer requires an index the integration owns, so this is a resolver
 * port. When absent, the aggregator reports an empty list.
 */
export interface CustomerStateMetersPort {
  listBalancesByCustomer(
    customerId: string,
  ): Promise<BillingResult<CustomerStateMeterBalance[]>>;
}

/** Resolves the customer record by id or external id (the customers api). */
export interface CustomerStateCustomersPort {
  getById(id: string): Promise<BillingResult<Customer | null>>;
  getByExternalId(externalId: string): Promise<BillingResult<Customer | null>>;
}

export interface CustomerStateDependencies {
  customers: CustomerStateCustomersPort;
  subscriptions: CustomerStateSubscriptionsPort;
  orders: CustomerStateOrdersPort;
  /** Optional: a customer-indexed entitlements resolver. */
  entitlements?: CustomerStateEntitlementsPort;
  /** Optional: a customer-indexed meter-balance resolver. */
  meters?: CustomerStateMetersPort;
}

export interface GetCustomerStateOptions {
  /**
   * How many most-recent orders to include. Defaults to 10. The orders lane has
   * no native ordering/limit on `list`, so the aggregator sorts by `createdAt`
   * descending and slices locally.
   */
  recentOrdersLimit?: number;
}

/**
 * The composed, read-only snapshot of everything that matters about one
 * customer: the customer record, their active subscriptions, granted
 * entitlements/benefits, meter credit balances, and recent orders.
 */
export interface CustomerState {
  customer: Customer;
  activeSubscriptions: CustomerStateSubscription[];
  entitlements: CustomerStateEntitlement[];
  meterBalances: CustomerStateMeterBalance[];
  recentOrders: CustomerStateOrder[];
}

/** Subscription statuses that count as "active" (still entitling the customer). */
const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "pending",
  "pending_payment",
  "past_due",
]);

const DEFAULT_RECENT_ORDERS_LIMIT = 10;

const notFound = <T>(message = "Cliente de billing não encontrado."): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.NOT_FOUND(),
      message,
    }),
  );

/**
 * A 32-bit FNV-1a hash of the JSON projection of a customer's state. Cheap,
 * deterministic, and order-stable for change detection between snapshots.
 */
const fingerprint = (state: CustomerState): string => {
  const projection = JSON.stringify({
    customer: {
      id: state.customer.id,
      updatedAt: state.customer.updatedAt,
      deletedAt: state.customer.deletedAt ?? null,
    },
    subscriptions: state.activeSubscriptions
      .map(sub => `${sub.id}:${sub.status}:${sub.priceId ?? ""}`)
      .sort(),
    entitlements: state.entitlements
      .map(ent => `${ent.feature}:${ent.allowed ? 1 : 0}:${ent.used}:${ent.remaining ?? ""}`)
      .sort(),
    meterBalances: state.meterBalances
      .map(meter => `${meter.meterId}:${meter.balance}`)
      .sort(),
    recentOrders: state.recentOrders
      .map(order => `${order.id}:${order.status}:${order.amountRefunded}`)
      .sort(),
  });

  let hash = 0x811c9dc5;
  for (let index = 0; index < projection.length; index += 1) {
    hash ^= projection.charCodeAt(index);
    // FNV prime, kept in 32-bit space.
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16);
};

/**
 * Builds a `getCustomerState(externalIdOrId)` reader over the supplied per-domain
 * read ports. Resolution order: try `getById` first; if that misses, fall back
 * to `getByExternalId`. Returns NOT_FOUND when neither resolves.
 *
 * The returned reader is a pure read — it composes list/balance reads and never
 * mutates. Emission of `billing.customer.state_changed` is handled by
 * {@link createCustomerStateWatcher}, which diffs successive snapshots.
 */
export const createGetCustomerState = (deps: CustomerStateDependencies) => {
  return async (
    externalIdOrId: string,
    options: GetCustomerStateOptions = {},
  ): Promise<BillingResult<CustomerState>> => {
    const byId = await deps.customers.getById(externalIdOrId);

    if (Result.isError(byId)) {
      return Result.err(byId.error);
    }

    let customer: Customer | null = byId.value;

    if (customer === null) {
      const byExternal = await deps.customers.getByExternalId(externalIdOrId);

      if (Result.isError(byExternal)) {
        return Result.err(byExternal.error);
      }

      customer = byExternal.value;
    }

    if (customer === null) {
      return notFound();
    }

    const customerId = customer.id;

    const subscriptionsResult = await deps.subscriptions.list({ customerId, limit: 100 });

    if (Result.isError(subscriptionsResult)) {
      return Result.err(subscriptionsResult.error);
    }

    const activeSubscriptions = subscriptionsResult.value.filter(sub =>
      ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status),
    );

    const ordersResult = await deps.orders.list({ customerId });

    if (Result.isError(ordersResult)) {
      return Result.err(ordersResult.error);
    }

    const recentOrdersLimit = options.recentOrdersLimit ?? DEFAULT_RECENT_ORDERS_LIMIT;
    const recentOrders = [...ordersResult.value]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, recentOrdersLimit);

    let entitlements: CustomerStateEntitlement[] = [];

    if (deps.entitlements !== undefined) {
      const entitlementsResult = await deps.entitlements.listByCustomer(customerId);

      if (Result.isError(entitlementsResult)) {
        return Result.err(entitlementsResult.error);
      }

      entitlements = entitlementsResult.value;
    }

    let meterBalances: CustomerStateMeterBalance[] = [];

    if (deps.meters !== undefined) {
      const metersResult = await deps.meters.listBalancesByCustomer(customerId);

      if (Result.isError(metersResult)) {
        return Result.err(metersResult.error);
      }

      meterBalances = metersResult.value;
    }

    return Result.ok({
      customer,
      activeSubscriptions,
      entitlements,
      meterBalances,
      recentOrders,
    });
  };
};

export type GetCustomerState = ReturnType<typeof createGetCustomerState>;

/**
 * The `billing.customer.state_changed` runtime event. Emitted by the watcher
 * when a freshly-read snapshot differs (by fingerprint) from the last one it saw
 * for the same customer.
 */
export interface CustomerStateChangedEvent {
  type: "billing.customer.state_changed";
  payload: {
    customerId: string;
    state: CustomerState;
    /** Fingerprint of the previous snapshot, if one had been seen. */
    previousFingerprint?: string;
    fingerprint: string;
  };
}

/**
 * Wraps `getCustomerState` with change detection: it reads the state, compares a
 * fingerprint of the snapshot against the last one seen for that customer, and
 * emits `billing.customer.state_changed` through the runtime when it differs.
 *
 * The fingerprint cache is in-memory and per-process; it is a best-effort change
 * signal, not a durable audit log. The wrapped reader still returns the full
 * `BillingResult<CustomerState>` so callers (e.g. the router) get the snapshot.
 */
export const createCustomerStateWatcher = (
  runtime: HyprPayRuntime,
  getCustomerState: GetCustomerState,
) => {
  const lastFingerprintByCustomer = new Map<string, string>();

  return async (
    externalIdOrId: string,
    options: GetCustomerStateOptions = {},
  ): Promise<BillingResult<CustomerState>> => {
    const result = await getCustomerState(externalIdOrId, options);

    if (Result.isError(result)) {
      return result;
    }

    const state = result.value;
    const customerId = state.customer.id;
    const next = fingerprint(state);
    const previous = lastFingerprintByCustomer.get(customerId);

    if (previous !== next) {
      lastFingerprintByCustomer.set(customerId, next);

      const event: CustomerStateChangedEvent = {
        type: "billing.customer.state_changed",
        payload: {
          customerId,
          state,
          fingerprint: next,
          ...(previous !== undefined ? { previousFingerprint: previous } : {}),
        },
      };

      await runtime.emit(event);
    }

    return result;
  };
};

export type CustomerStateWatcher = ReturnType<typeof createCustomerStateWatcher>;
