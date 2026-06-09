import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntimeEvent } from "@hyprpay/core";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import type { Order } from "@hyprpay/orders";
import type { OrdersRefundPort } from "@hyprpay/orders";
import { refunds } from "../src/refunds-plugin";
import type { RefundsApi, RefundPluginEvent } from "../src/refunds-plugin";
import type { RefundsDatabaseAdapter } from "../src/contracts/refunds-database-adapter";
import type { RefundsProviderAdapter } from "../src/contracts/refunds-provider-adapter";
import type { BillingResult } from "../src/results/billing-result";
import type { Refund, RefundListFilter, RefundStatus } from "../src/schemas/refund-schema";

const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: "order_1",
  customerId: "cust_1",
  status: "paid",
  billingReason: "purchase",
  currency: "BRL",
  items: [
    {
      id: "line_1",
      label: "Plano Pro",
      type: "product",
      quantity: 1,
      unitAmount: 10_000,
      amount: 10_000,
    },
  ],
  subtotalAmount: 10_000,
  discountAmount: 0,
  taxAmount: 0,
  totalAmount: 10_000,
  amountRefunded: 0,
  createdAt: new Date().toISOString(),
  ...overrides,
});

// In-memory orders port that tracks refunded amount and enforces over-refund.
const createOrdersPort = (initial: Order): { port: OrdersRefundPort; order: () => Order } => {
  let order = initial;

  return {
    port: {
      get: async (id: string): Promise<BillingResult<Order | null>> =>
        Result.ok(id === order.id ? order : null),
      recordRefund: async ({
        orderId,
        amount,
      }: {
        orderId: string;
        amount: number;
      }): Promise<BillingResult<Order>> => {
        if (orderId !== order.id) {
          return Result.ok(order);
        }

        const nextRefunded = order.amountRefunded + amount;
        const status =
          nextRefunded >= order.totalAmount ? "refunded" : "partially_refunded";
        order = { ...order, amountRefunded: nextRefunded, status };

        return Result.ok(order);
      },
    },
    order: () => order,
  };
};

// In-memory refunds database adapter implementing the full contract incl. list/update.
const createDb = (): RefundsDatabaseAdapter => {
  const store = new Map<string, Refund>();

  const list = (filter: RefundListFilter): Refund[] => {
    let rows = [...store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (filter.orderId !== undefined) {
      rows = rows.filter(r => r.orderId === filter.orderId);
    }

    if (filter.customerId !== undefined) {
      rows = rows.filter(r => r.customerId === filter.customerId);
    }

    if (filter.subscriptionId !== undefined) {
      rows = rows.filter(r => r.subscriptionId === filter.subscriptionId);
    }

    if (filter.status !== undefined) {
      rows = rows.filter(r => r.status === filter.status);
    }

    if (filter.cursor !== undefined) {
      const idx = rows.findIndex(r => r.id === filter.cursor);

      if (idx >= 0) {
        rows = rows.slice(idx + 1);
      }
    }

    if (filter.limit !== undefined) {
      rows = rows.slice(0, filter.limit);
    }

    return rows;
  };

  return {
    refunds: {
      create: async (input: Refund) => {
        store.set(input.id, input);

        return Result.ok(input);
      },
      findById: async (id: string) => Result.ok(store.get(id) ?? null),
      update: async (input: Refund) => {
        store.set(input.id, input);

        return Result.ok(input);
      },
      listByOrder: async (orderId: string) => Result.ok(list({ orderId })),
      list: async (filter: RefundListFilter) => Result.ok(list(filter)),
    },
  };
};

// Captures every event the refunds plugin emits via runtime.emit.
const eventCapturePlugin = (
  sink: RefundPluginEvent[],
): HyprPayPlugin<"eventCapture", Record<string, never>> => ({
  id: "event-capture",
  namespace: "eventCapture",
  hooks: {
    onEvent: async (event: HyprPayRuntimeEvent) => {
      if (event.type.startsWith("billing.refund.")) {
        sink.push(event as RefundPluginEvent);
      }
    },
  },
});

const setup = (opts: {
  order?: Order;
  provider?: RefundsProviderAdapter;
}) => {
  const events: RefundPluginEvent[] = [];
  const { port, order } = createOrdersPort(opts.order ?? makeOrder());
  const database = createDb();

  const hyprpay = createHyprPay({
    plugins: [
      refunds(
        opts.provider === undefined
          ? { database, orders: port }
          : { database, orders: port, provider: opts.provider },
      ),
      eventCapturePlugin(events),
    ] as const,
  });

  const api = hyprpay.api.refunds as RefundsApi;

  return { api, events, order, database };
};

const okValue = <T>(result: BillingResult<T>): T => {
  if (Result.isError(result)) {
    throw new Error(`expected ok, got error: ${result.error.message}`);
  }

  return result.value;
};

describe("@hyprpay/refunds lifecycle", () => {
  it("creates refunds in pending status (not hardcoded succeeded) and emits only created", async () => {
    const { api, events } = setup({});

    const refund = okValue(await api.create({ orderId: "order_1" }));

    expect(refund.status).toBe("pending");
    expect(refund.settledAt).toBeUndefined();
    expect(refund.amount).toBe(10_000);
    expect(refund.customerId).toBe("cust_1");
    expect(events.map(e => e.type)).toEqual(["billing.refund.created"]);
  });

  it("honors a provider-reported initial status and emits the terminal event on create", async () => {
    const provider: RefundsProviderAdapter = {
      id: "fake",
      createRefund: async () =>
        Result.ok({ providerRefundId: "pr_sync", status: "succeeded" as RefundStatus }),
    };
    const { api, events } = setup({ provider });

    const refund = okValue(await api.create({ orderId: "order_1" }));

    expect(refund.status).toBe("succeeded");
    expect(refund.providerRefundId).toBe("pr_sync");
    expect(refund.settledAt).toBeDefined();
    expect(events.map(e => e.type)).toEqual([
      "billing.refund.created",
      "billing.refund.succeeded",
    ]);
  });

  it("transitions a pending refund to succeeded and emits billing.refund.succeeded", async () => {
    const { api, events } = setup({});

    const created = okValue(await api.create({ orderId: "order_1" }));
    const settled = okValue(await api.transition({ id: created.id, status: "succeeded" }));

    expect(settled.status).toBe("succeeded");
    expect(settled.settledAt).toBeDefined();
    expect(settled.updatedAt).toBeDefined();
    expect(events.map(e => e.type)).toEqual([
      "billing.refund.created",
      "billing.refund.succeeded",
    ]);
  });

  it("transitions a pending refund to failed and emits billing.refund.failed", async () => {
    const { api, events } = setup({});

    const created = okValue(await api.create({ orderId: "order_1" }));
    const settled = okValue(
      await api.transition({
        id: created.id,
        status: "failed",
        metadata: { providerError: "insufficient_funds" },
      }),
    );

    expect(settled.status).toBe("failed");
    expect(settled.metadata?.providerError).toBe("insufficient_funds");
    expect(events.at(-1)?.type).toBe("billing.refund.failed");
  });

  it("transitions a pending refund to canceled and emits billing.refund.canceled", async () => {
    const { api, events } = setup({});

    const created = okValue(await api.create({ orderId: "order_1" }));
    const settled = okValue(await api.transition({ id: created.id, status: "canceled" }));

    expect(settled.status).toBe("canceled");
    expect(events.at(-1)?.type).toBe("billing.refund.canceled");
  });

  it("rejects a transition out of a terminal status (INVALID_STATE)", async () => {
    const { api } = setup({});

    const created = okValue(await api.create({ orderId: "order_1" }));
    okValue(await api.transition({ id: created.id, status: "succeeded" }));

    const second = await api.transition({ id: created.id, status: "failed" });

    expect(Result.isError(second)).toBe(true);

    if (Result.isError(second)) {
      expect(second.error.error.status).toBe(409);
    }
  });

  it("rejects transition for an unknown refund (NOT_FOUND)", async () => {
    const { api } = setup({});

    const result = await api.transition({ id: "does-not-exist", status: "succeeded" });

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error.error.status).toBe(404);
    }
  });

  it("attaches a provider refund id on transition when supplied", async () => {
    const { api } = setup({});

    const created = okValue(await api.create({ orderId: "order_1" }));
    const settled = okValue(
      await api.transition({ id: created.id, status: "succeeded", providerRefundId: "pr_late" }),
    );

    expect(settled.providerRefundId).toBe("pr_late");
  });
});

describe("@hyprpay/refunds over-refund guard (unchanged behavior)", () => {
  it("guards partial refunds against exceeding remaining balance", async () => {
    const { api } = setup({});

    okValue(await api.create({ orderId: "order_1", amount: 6_000 }));

    const tooMuch = await api.create({ orderId: "order_1", amount: 5_000 });

    expect(Result.isError(tooMuch)).toBe(true);

    if (Result.isError(tooMuch)) {
      expect(tooMuch.error.error.status).toBe(400);
    }
  });

  it("returns NOT_FOUND when the order is missing", async () => {
    const { api } = setup({});

    const result = await api.create({ orderId: "missing-order" });

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error.error.status).toBe(404);
    }
  });
});

describe("@hyprpay/refunds listing with filters/pagination", () => {
  const order = makeOrder({ subscriptionId: "sub_1", totalAmount: 100_000, subtotalAmount: 100_000 });

  it("lists by order, by customer, and by subscription", async () => {
    const { api } = setup({ order });

    okValue(await api.create({ orderId: "order_1", amount: 1_000 }));
    okValue(await api.create({ orderId: "order_1", amount: 2_000 }));

    expect(okValue(await api.listByOrder("order_1"))).toHaveLength(2);
    expect(okValue(await api.listByCustomer("cust_1"))).toHaveLength(2);
    expect(okValue(await api.listBySubscription("sub_1"))).toHaveLength(2);
    expect(okValue(await api.listByCustomer("cust_unknown"))).toHaveLength(0);
    expect(okValue(await api.listBySubscription("sub_unknown"))).toHaveLength(0);
  });

  it("filters by status", async () => {
    const { api } = setup({ order });

    const a = okValue(await api.create({ orderId: "order_1", amount: 1_000 }));
    okValue(await api.create({ orderId: "order_1", amount: 2_000 }));
    okValue(await api.transition({ id: a.id, status: "succeeded" }));

    expect(okValue(await api.list({ status: "succeeded" }))).toHaveLength(1);
    expect(okValue(await api.list({ status: "pending" }))).toHaveLength(1);
  });

  it("paginates with limit + cursor", async () => {
    const { api } = setup({ order });

    const first = okValue(await api.create({ orderId: "order_1", amount: 1_000 }));
    okValue(await api.create({ orderId: "order_1", amount: 2_000 }));
    okValue(await api.create({ orderId: "order_1", amount: 3_000 }));

    const page1 = okValue(await api.list({ customerId: "cust_1", limit: 2 }));

    expect(page1).toHaveLength(2);
    expect(page1[0]?.id).toBe(first.id);

    const page2 = okValue(
      await api.list({ customerId: "cust_1", limit: 2, cursor: page1[1]?.id ?? "" }),
    );

    expect(page2).toHaveLength(1);
  });

  it("rejects an invalid list filter (INVALID_INPUT)", async () => {
    const { api } = setup({ order });

    const result = await api.list({ limit: -1 } as RefundListFilter);

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error.error.status).toBe(400);
    }
  });
});
