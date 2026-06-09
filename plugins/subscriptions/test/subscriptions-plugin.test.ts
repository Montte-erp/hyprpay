import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import type { CatalogPriceLookupAdapter } from "@hyprpay/catalog";
import { subscriptions } from "../src/subscriptions-plugin";
import type { SubscriptionsDatabaseAdapter } from "../src/contracts/subscriptions-database-adapter";
import type { SubscriptionsProviderAdapter } from "../src/contracts/subscriptions-provider-adapter";
import type {
  ListSubscriptionsFilter,
  Subscription,
} from "../src/schemas/subscription-schema";

const HOUR_MS = 60 * 60 * 1000;

/** Minimal in-memory subscriptions store implementing the DB adapter contract. */
const createInMemoryDatabase = (): SubscriptionsDatabaseAdapter & {
  rows: Map<string, Subscription>;
} => {
  const rows = new Map<string, Subscription>();

  return {
    rows,
    subscriptions: {
      create: async (input: Subscription) => {
        rows.set(input.id, input);
        return Result.ok(input);
      },
      update: async (input: Subscription) => {
        rows.set(input.id, input);
        return Result.ok(input);
      },
      findById: async (id: string) => Result.ok(rows.get(id) ?? null),
      list: async (filter: ListSubscriptionsFilter) => {
        let items = [...rows.values()];

        if (filter.customerId !== undefined) {
          items = items.filter(row => row.customerId === filter.customerId);
        }
        if (filter.status !== undefined) {
          items = items.filter(row => row.status === filter.status);
        }
        if (filter.priceId !== undefined) {
          items = items.filter(row => row.priceId === filter.priceId);
        }

        return Result.ok(items.slice(filter.offset, filter.offset + filter.limit));
      },
    },
  };
};

/** Fake catalog lookup that returns prices with the given amounts. */
const createCatalog = (prices: Record<string, number>): CatalogPriceLookupAdapter => ({
  prices: {
    findById: async (id: string) => {
      const amount = prices[id];
      if (amount === undefined) {
        return Result.ok(null);
      }
      return Result.ok({
        id,
        productId: "prod_1",
        slug: id,
        amount,
        currency: "BRL" as const,
        interval: "month" as const,
        usageBased: false,
        active: true,
        providerProductId: "prov_prod_1",
      });
    },
  },
});

/** Fake provider that echoes a subscription back from create/cancel. */
const createProvider = (
  overrides: Partial<Subscription> = {},
): SubscriptionsProviderAdapter => ({
  id: "fake",
  createSubscription: async input => {
    const subscription: Subscription = {
      id: `sub_${Math.random().toString(36).slice(2)}`,
      customerId: input.customerId,
      priceId: input.priceId,
      paymentMethod: input.paymentMethod,
      status: "active",
      cancelAtPeriodEnd: false,
      dunningRetryCount: 0,
      providerSubscriptionId: "prov_sub_1",
      currentPeriodStart: "2026-06-01T00:00:00.000Z",
      currentPeriodEnd: "2026-07-01T00:00:00.000Z",
      ...overrides,
    };
    return Result.ok(subscription);
  },
  cancelSubscription: async input => {
    const subscription: Subscription = {
      id: input.subscriptionId,
      customerId: "cust_1",
      priceId: "price_basic",
      paymentMethod: "pix",
      status: "active",
      cancelAtPeriodEnd: true,
      dunningRetryCount: 0,
      canceledAt: "2026-06-15T00:00:00.000Z",
    };
    return Result.ok(subscription);
  },
});

const buildPlugin = (opts?: {
  prices?: Record<string, number>;
  dunning?: Parameters<typeof subscriptions>[0]["dunning"];
}) => {
  const database = createInMemoryDatabase();
  const catalog = createCatalog(opts?.prices ?? { price_basic: 1000, price_pro: 3000 });
  const provider = createProvider();

  const hyprpay = createHyprPay({
    plugins: [
      subscriptions({
        database,
        catalog,
        provider,
        ...(opts?.dunning !== undefined ? { dunning: opts.dunning } : {}),
      }),
    ] as const,
  });

  return { hyprpay, database };
};

const seed = (
  database: ReturnType<typeof createInMemoryDatabase>,
  subscription: Subscription,
) => {
  database.rows.set(subscription.id, subscription);
};

const baseSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: "sub_seed",
  customerId: "cust_1",
  priceId: "price_basic",
  paymentMethod: "pix",
  status: "active",
  cancelAtPeriodEnd: false,
  dunningRetryCount: 0,
  currentPeriodStart: "2026-06-01T00:00:00.000Z",
  currentPeriodEnd: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

describe("@hyprpay/subscriptions create + discount", () => {
  it("creates a subscription and persists discount references", async () => {
    const { hyprpay, database } = buildPlugin();

    const created = await hyprpay.api.subscriptions.create({
      customerId: "cust_1",
      priceId: "price_basic",
      paymentMethod: "pix",
      discountId: "disc_1",
      discountCode: "WELCOME10",
    });

    expect(Result.isOk(created)).toBe(true);
    if (Result.isOk(created)) {
      expect(created.value.discountId).toBe("disc_1");
      expect(created.value.discountCode).toBe("WELCOME10");
      expect(database.rows.get(created.value.id)?.discountCode).toBe("WELCOME10");
    }
  });
});

describe("@hyprpay/subscriptions get + list", () => {
  it("returns null for a missing subscription and the row when present", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(database, baseSubscription({ id: "sub_a" }));

    const missing = await hyprpay.api.subscriptions.get("nope");
    expect(Result.isOk(missing)).toBe(true);
    if (Result.isOk(missing)) {
      expect(missing.value).toBeNull();
    }

    const found = await hyprpay.api.subscriptions.get("sub_a");
    expect(Result.isOk(found)).toBe(true);
    if (Result.isOk(found)) {
      expect(found.value?.id).toBe("sub_a");
    }
  });

  it("filters and paginates", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(database, baseSubscription({ id: "s1", customerId: "cust_1", status: "active" }));
    seed(database, baseSubscription({ id: "s2", customerId: "cust_1", status: "past_due" }));
    seed(database, baseSubscription({ id: "s3", customerId: "cust_2", status: "active" }));

    const byCustomer = await hyprpay.api.subscriptions.list({
      customerId: "cust_1",
      limit: 20,
      offset: 0,
    });
    expect(Result.isOk(byCustomer)).toBe(true);
    if (Result.isOk(byCustomer)) {
      expect(byCustomer.value).toHaveLength(2);
    }

    const byStatus = await hyprpay.api.subscriptions.list({
      status: "active",
      limit: 20,
      offset: 0,
    });
    expect(Result.isOk(byStatus)).toBe(true);
    if (Result.isOk(byStatus)) {
      expect(byStatus.value.map(s => s.id).sort()).toEqual(["s1", "s3"]);
    }

    const paginated = await hyprpay.api.subscriptions.list({ limit: 1, offset: 0 });
    expect(Result.isOk(paginated)).toBe(true);
    if (Result.isOk(paginated)) {
      expect(paginated.value).toHaveLength(1);
    }
  });
});

describe("@hyprpay/subscriptions update + proration", () => {
  it("prorates a mid-cycle plan change using @hyprpay/money", async () => {
    const { hyprpay, database } = buildPlugin({
      prices: { price_basic: 1000, price_pro: 3000 },
    });
    // Half the period remains at change time (June 16 of a June 1 -> July 1 period).
    seed(
      database,
      baseSubscription({
        id: "sub_p",
        priceId: "price_basic",
        currentPeriodStart: "2026-06-01T00:00:00.000Z",
        currentPeriodEnd: "2026-07-01T00:00:00.000Z",
      }),
    );

    const updated = await hyprpay.api.subscriptions.update({
      subscriptionId: "sub_p",
      priceId: "price_pro",
      prorationBehavior: "prorate",
    });

    expect(Result.isOk(updated)).toBe(true);
    if (Result.isOk(updated)) {
      expect(updated.value.subscription.priceId).toBe("price_pro");
      expect(updated.value.proration).toBeDefined();
      // credit and charge are non-negative; net = charge - credit.
      const proration = updated.value.proration;
      if (proration !== undefined) {
        expect(proration.creditAmount).toBeGreaterThanOrEqual(0);
        expect(proration.chargeAmount).toBeGreaterThan(proration.creditAmount);
        expect(proration.netAmount).toBe(proration.chargeAmount - proration.creditAmount);
      }
    }
  });

  it("swaps immediately with no proration when behavior is none", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(database, baseSubscription({ id: "sub_n", priceId: "price_basic" }));

    const updated = await hyprpay.api.subscriptions.update({
      subscriptionId: "sub_n",
      priceId: "price_pro",
      prorationBehavior: "none",
    });

    expect(Result.isOk(updated)).toBe(true);
    if (Result.isOk(updated)) {
      expect(updated.value.subscription.priceId).toBe("price_pro");
      expect(updated.value.proration).toBeUndefined();
    }
  });

  it("defers the price change to next_period without changing the live price", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(database, baseSubscription({ id: "sub_np", priceId: "price_basic" }));

    const updated = await hyprpay.api.subscriptions.update({
      subscriptionId: "sub_np",
      priceId: "price_pro",
      prorationBehavior: "next_period",
    });

    expect(Result.isOk(updated)).toBe(true);
    if (Result.isOk(updated)) {
      expect(updated.value.subscription.priceId).toBe("price_basic");
      expect(updated.value.subscription.metadata?.pendingPriceId).toBe("price_pro");
    }
  });

  it("rejects proration when no billing period is set", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(
      database,
      baseSubscription({
        id: "sub_noperiod",
        priceId: "price_basic",
        currentPeriodStart: undefined,
        currentPeriodEnd: undefined,
      }),
    );

    const updated = await hyprpay.api.subscriptions.update({
      subscriptionId: "sub_noperiod",
      priceId: "price_pro",
      prorationBehavior: "prorate",
    });

    expect(Result.isError(updated)).toBe(true);
  });

  it("updates discount references on an existing subscription", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(database, baseSubscription({ id: "sub_d" }));

    const updated = await hyprpay.api.subscriptions.update({
      subscriptionId: "sub_d",
      discountId: "disc_xyz",
      discountCode: "SAVE20",
    });

    expect(Result.isOk(updated)).toBe(true);
    if (Result.isOk(updated)) {
      expect(updated.value.subscription.discountId).toBe("disc_xyz");
      expect(updated.value.subscription.discountCode).toBe("SAVE20");
    }
  });
});

describe("@hyprpay/subscriptions uncancel", () => {
  it("reverses a pending cancel-at-period-end", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(
      database,
      baseSubscription({
        id: "sub_c",
        cancelAtPeriodEnd: true,
        canceledAt: "2026-06-15T00:00:00.000Z",
        status: "active",
      }),
    );

    const result = await hyprpay.api.subscriptions.uncancel({ subscriptionId: "sub_c" });

    expect(Result.isOk(result)).toBe(true);
    if (Result.isOk(result)) {
      expect(result.value.cancelAtPeriodEnd).toBe(false);
      expect(result.value.canceledAt).toBeUndefined();
    }
  });

  it("rejects uncancel when not scheduled to cancel", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(database, baseSubscription({ id: "sub_live", cancelAtPeriodEnd: false }));

    const result = await hyprpay.api.subscriptions.uncancel({ subscriptionId: "sub_live" });
    expect(Result.isError(result)).toBe(true);
  });

  it("rejects uncancel on an already-terminated subscription", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(
      database,
      baseSubscription({ id: "sub_dead", status: "canceled", cancelAtPeriodEnd: true }),
    );

    const result = await hyprpay.api.subscriptions.uncancel({ subscriptionId: "sub_dead" });
    expect(Result.isError(result)).toBe(true);
  });
});

describe("@hyprpay/subscriptions dunning state machine", () => {
  it("moves to past_due and schedules the first retry on payment failure", async () => {
    const { hyprpay, database } = buildPlugin({
      dunning: { maxRetries: 2, retryIntervalsHours: [24, 48], gracePeriodHours: 24 },
    });
    seed(database, baseSubscription({ id: "sub_pf", status: "active" }));

    const failed = await hyprpay.api.subscriptions.markPaymentFailed({
      subscriptionId: "sub_pf",
      failedAt: "2026-06-10T00:00:00.000Z",
      reason: "card_declined",
    });

    expect(Result.isOk(failed)).toBe(true);
    if (Result.isOk(failed)) {
      expect(failed.value.status).toBe("past_due");
      expect(failed.value.pastDueAt).toBe("2026-06-10T00:00:00.000Z");
      expect(failed.value.lastPaymentError).toBe("card_declined");
      expect(failed.value.nextRetryAt).toBe(
        new Date(Date.parse("2026-06-10T00:00:00.000Z") + 24 * HOUR_MS).toISOString(),
      );
    }
  });

  it("recovers to active when a retry succeeds", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(
      database,
      baseSubscription({
        id: "sub_rec",
        status: "past_due",
        pastDueAt: "2026-06-10T00:00:00.000Z",
        dunningRetryCount: 1,
        nextRetryAt: "2026-06-11T00:00:00.000Z",
        lastPaymentError: "card_declined",
      }),
    );

    const recovered = await hyprpay.api.subscriptions.retry({
      subscriptionId: "sub_rec",
      succeeded: true,
    });

    expect(Result.isOk(recovered)).toBe(true);
    if (Result.isOk(recovered)) {
      expect(recovered.value.status).toBe("active");
      expect(recovered.value.dunningRetryCount).toBe(0);
      expect(recovered.value.nextRetryAt).toBeUndefined();
      expect(recovered.value.pastDueAt).toBeUndefined();
      expect(recovered.value.lastPaymentError).toBeUndefined();
    }
  });

  it("exhausts retries then auto-cancels after the grace window", async () => {
    const { hyprpay, database } = buildPlugin({
      dunning: { maxRetries: 1, retryIntervalsHours: [24], gracePeriodHours: 24 },
    });
    seed(database, baseSubscription({ id: "sub_exh", status: "active" }));

    // Fail -> past_due, retryCount 0, first retry scheduled.
    await hyprpay.api.subscriptions.markPaymentFailed({
      subscriptionId: "sub_exh",
      failedAt: "2026-06-01T00:00:00.000Z",
    });

    // Retry #1 fails -> retryCount becomes 1 (== maxRetries).
    const r1 = await hyprpay.api.subscriptions.retry({
      subscriptionId: "sub_exh",
      succeeded: false,
      attemptedAt: "2026-06-02T00:00:00.000Z",
    });
    expect(Result.isOk(r1)).toBe(true);
    if (Result.isOk(r1)) {
      expect(r1.value.status).toBe("past_due");
      expect(r1.value.dunningRetryCount).toBe(1);
    }

    // Next failed retry: retries are exhausted, set the grace window.
    const r2 = await hyprpay.api.subscriptions.retry({
      subscriptionId: "sub_exh",
      succeeded: false,
      attemptedAt: "2026-06-03T00:00:00.000Z",
    });
    expect(Result.isOk(r2)).toBe(true);
    if (Result.isOk(r2)) {
      expect(r2.value.status).toBe("past_due");
      expect(r2.value.graceEndsAt).toBeDefined();
    }

    // After grace elapses, the next failed retry cancels the subscription.
    const r3 = await hyprpay.api.subscriptions.retry({
      subscriptionId: "sub_exh",
      succeeded: false,
      attemptedAt: "2026-06-30T00:00:00.000Z",
    });
    expect(Result.isOk(r3)).toBe(true);
    if (Result.isOk(r3)) {
      expect(r3.value.status).toBe("canceled");
      expect(r3.value.canceledAt).toBeDefined();
      expect(r3.value.endedAt).toBeDefined();
    }
  });

  it("rejects retry on a subscription that is not past_due", async () => {
    const { hyprpay, database } = buildPlugin();
    seed(database, baseSubscription({ id: "sub_active", status: "active" }));

    const result = await hyprpay.api.subscriptions.retry({
      subscriptionId: "sub_active",
      succeeded: false,
    });
    expect(Result.isError(result)).toBe(true);
  });

  it("emits dunning_exhausted when the subscription is auto-canceled", async () => {
    const events: string[] = [];
    const database = createInMemoryDatabase();
    seed(
      database,
      baseSubscription({
        id: "sub_emit",
        status: "past_due",
        dunningRetryCount: 1,
        graceEndsAt: "2026-06-02T00:00:00.000Z",
      }),
    );
    const catalog = createCatalog({ price_basic: 1000 });
    const provider = createProvider();

    // A tiny sink plugin taps every emitted event through the runtime.
    const sink = {
      id: "sink",
      namespace: "sink" as const,
      hooks: {
        onEvent: async (event: { type: string }) => {
          events.push(event.type);
        },
      },
    };

    const withSink = createHyprPay({
      plugins: [
        subscriptions({
          database,
          catalog,
          provider,
          dunning: { maxRetries: 1, retryIntervalsHours: [24], gracePeriodHours: 24 },
        }),
        sink,
      ] as const,
    });

    const canceled = await withSink.api.subscriptions.retry({
      subscriptionId: "sub_emit",
      succeeded: false,
      attemptedAt: "2026-06-30T00:00:00.000Z",
    });

    expect(Result.isOk(canceled)).toBe(true);
    expect(events).toContain("billing.subscription.dunning_exhausted");
  });
});
