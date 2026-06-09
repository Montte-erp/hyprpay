import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import { createInMemoryMetersAdapter } from "../src/in-memory-meters-adapter";
import { meters } from "../src/meters-plugin";

const expectOk = <T>(result: Result<T, unknown>): T => {
  if (Result.isError(result)) {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const setup = () => {
  const database = createInMemoryMetersAdapter();
  const hyprpay = createHyprPay({
    plugins: [meters({ database })] as const,
  });
  return { database, api: hyprpay.api.meters };
};

const T = (iso: string) => new Date(iso).toISOString();

describe("@hyprpay/meters — createMeter + ingest", () => {
  it("creates a meter and ingests an event", async () => {
    const { api } = setup();

    const meter = expectOk(
      await api.createMeter({
        slug: "api-calls",
        name: "API Calls",
        eventName: "api.request",
        aggregation: "count",
      }),
    );

    expect(meter.id).toBeString();
    expect(meter.aggregation).toBe("count");
    expect(meter.filters).toEqual({});

    const event = expectOk(
      await api.ingest({ meterId: meter.id, customerId: "cust_1", value: 1 }),
    );
    expect(event.id).toBeString();
    expect(event.timestamp).toBeString();
  });

  it("dedupes ingestion on idempotencyKey", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({ slug: "m", name: "M", eventName: "e" }),
    );

    const first = expectOk(
      await api.ingest({
        meterId: meter.id,
        customerId: "cust_1",
        value: 5,
        idempotencyKey: "k1",
      }),
    );
    const second = expectOk(
      await api.ingest({
        meterId: meter.id,
        customerId: "cust_1",
        value: 99,
        idempotencyKey: "k1",
      }),
    );

    expect(second.id).toBe(first.id);
    expect(second.value).toBe(5);
  });
});

describe("@hyprpay/meters — DEFECT 1: filters", () => {
  it("filters events by eventName via metadata.eventName", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({
        slug: "s",
        name: "S",
        eventName: "api.request",
        aggregation: "count",
      }),
    );

    // Matching event name
    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      subscriptionId: "sub_1",
      value: 1,
      timestamp: T("2026-01-01T01:00:00.000Z"),
      metadata: { eventName: "api.request" },
    });
    // Different event name → must be excluded
    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      subscriptionId: "sub_1",
      value: 1,
      timestamp: T("2026-01-01T02:00:00.000Z"),
      metadata: { eventName: "api.response" },
    });
    // Untagged event → kept (legacy)
    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      subscriptionId: "sub_1",
      value: 1,
      timestamp: T("2026-01-01T03:00:00.000Z"),
    });

    const snapshot = expectOk(
      await api.aggregate({
        meterId: meter.id,
        subscriptionId: "sub_1",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-01-02T00:00:00.000Z",
      }),
    );

    // 1 matching + 1 untagged = 2; the api.response event is excluded
    expect(snapshot.aggregatedValue).toBe(2);
  });

  it("applies property-equals filter clauses", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({
        slug: "s2",
        name: "S2",
        eventName: "api.request",
        aggregation: "count",
        filters: { region: "br" },
      }),
    );

    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      subscriptionId: "sub_1",
      value: 1,
      timestamp: T("2026-01-01T01:00:00.000Z"),
      metadata: { region: "br" },
    });
    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      subscriptionId: "sub_1",
      value: 1,
      timestamp: T("2026-01-01T02:00:00.000Z"),
      metadata: { region: "us" },
    });

    const snapshot = expectOk(
      await api.aggregate({
        meterId: meter.id,
        subscriptionId: "sub_1",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-01-02T00:00:00.000Z",
      }),
    );

    expect(snapshot.aggregatedValue).toBe(1);
  });

  it("reads value from valueProperty when configured", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({
        slug: "s3",
        name: "S3",
        eventName: "tokens.used",
        aggregation: "sum",
        valueProperty: "tokens",
      }),
    );

    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      subscriptionId: "sub_1",
      value: 1, // ignored: valueProperty present
      timestamp: T("2026-01-01T01:00:00.000Z"),
      metadata: { tokens: "100" },
    });
    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      subscriptionId: "sub_1",
      value: 1,
      timestamp: T("2026-01-01T02:00:00.000Z"),
      metadata: { tokens: "250" },
    });
    // Missing valueProperty → falls back to event.value
    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      subscriptionId: "sub_1",
      value: 7,
      timestamp: T("2026-01-01T03:00:00.000Z"),
    });

    const snapshot = expectOk(
      await api.aggregate({
        meterId: meter.id,
        subscriptionId: "sub_1",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-01-02T00:00:00.000Z",
      }),
    );

    expect(snapshot.aggregatedValue).toBe(357);
  });
});

describe("@hyprpay/meters — DEFECT 3: aggregations", () => {
  const seed = async (
    api: ReturnType<typeof setup>["api"],
    aggregation: "average" | "min" | "unique",
    values: number[],
  ) => {
    const meter = expectOk(
      await api.createMeter({ slug: `agg-${aggregation}`, name: aggregation, eventName: "e", aggregation }),
    );
    let hour = 1;
    for (const value of values) {
      await api.ingest({
        meterId: meter.id,
        customerId: "c1",
        subscriptionId: "sub_1",
        value,
        timestamp: T(`2026-01-01T0${hour}:00:00.000Z`),
      });
      hour += 1;
    }
    return expectOk(
      await api.aggregate({
        meterId: meter.id,
        subscriptionId: "sub_1",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-01-02T00:00:00.000Z",
      }),
    );
  };

  it("average", async () => {
    const { api } = setup();
    const snapshot = await seed(api, "average", [2, 4, 6]);
    expect(snapshot.aggregatedValue).toBe(4);
  });

  it("min", async () => {
    const { api } = setup();
    const snapshot = await seed(api, "min", [5, 2, 8]);
    expect(snapshot.aggregatedValue).toBe(2);
  });

  it("unique", async () => {
    const { api } = setup();
    const snapshot = await seed(api, "unique", [3, 3, 7, 7, 9]);
    expect(snapshot.aggregatedValue).toBe(3);
  });

  it("empty window yields 0 for min/average", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({ slug: "empty", name: "E", eventName: "e", aggregation: "min" }),
    );
    const snapshot = expectOk(
      await api.aggregate({
        meterId: meter.id,
        subscriptionId: "sub_1",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-01-02T00:00:00.000Z",
      }),
    );
    expect(snapshot.aggregatedValue).toBe(0);
  });
});

describe("@hyprpay/meters — DEFECT 3: time-bucketed quantities", () => {
  it("buckets events across a period by day", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({ slug: "q", name: "Q", eventName: "e", aggregation: "sum" }),
    );

    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      value: 10,
      timestamp: T("2026-01-01T05:00:00.000Z"),
    });
    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      value: 20,
      timestamp: T("2026-01-02T05:00:00.000Z"),
    });

    const quantities = expectOk(
      await api.quantities({
        meterId: meter.id,
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-01-03T00:00:00.000Z",
        interval: "day",
      }),
    );

    expect(quantities.buckets).toHaveLength(2);
    expect(quantities.buckets[0]?.value).toBe(10);
    expect(quantities.buckets[1]?.value).toBe(20);
  });

  it("rejects an inverted period", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({ slug: "q2", name: "Q2", eventName: "e" }),
    );

    const result = await api.quantities({
      meterId: meter.id,
      periodStart: "2026-01-03T00:00:00.000Z",
      periodEnd: "2026-01-01T00:00:00.000Z",
      interval: "day",
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("filters buckets by customerId", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({ slug: "q3", name: "Q3", eventName: "e", aggregation: "sum" }),
    );

    await api.ingest({
      meterId: meter.id,
      customerId: "c1",
      value: 10,
      timestamp: T("2026-01-01T05:00:00.000Z"),
    });
    await api.ingest({
      meterId: meter.id,
      customerId: "c2",
      value: 99,
      timestamp: T("2026-01-01T06:00:00.000Z"),
    });

    const quantities = expectOk(
      await api.quantities({
        meterId: meter.id,
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-01-02T00:00:00.000Z",
        interval: "day",
        customerId: "c1",
      }),
    );

    expect(quantities.buckets).toHaveLength(1);
    expect(quantities.buckets[0]?.value).toBe(10);
  });
});

describe("@hyprpay/meters — DEFECT 2: per-customer balance / credits", () => {
  it("grants credit and reads balance", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({ slug: "b", name: "B", eventName: "e", aggregation: "sum" }),
    );

    const credit = expectOk(
      await api.grantCredit({ meterId: meter.id, customerId: "c1", amount: 100 }),
    );
    expect(credit.granted).toBe(100);
    expect(credit.consumed).toBe(0);

    const balance = expectOk(await api.balance({ meterId: meter.id, customerId: "c1" }));
    expect(balance.granted).toBe(100);
    expect(balance.consumed).toBe(0);
    expect(balance.balance).toBe(100);
  });

  it("draws down balance as events are ingested", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({ slug: "b2", name: "B2", eventName: "e", aggregation: "sum" }),
    );

    await api.grantCredit({ meterId: meter.id, customerId: "c1", amount: 100 });
    await api.ingest({ meterId: meter.id, customerId: "c1", value: 30 });
    await api.ingest({ meterId: meter.id, customerId: "c1", value: 10 });

    const balance = expectOk(await api.balance({ meterId: meter.id, customerId: "c1" }));
    expect(balance.consumed).toBe(40);
    expect(balance.balance).toBe(60);
  });

  it("accumulates grants and isolates per customer", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({ slug: "b3", name: "B3", eventName: "e", aggregation: "sum" }),
    );

    await api.grantCredit({ meterId: meter.id, customerId: "c1", amount: 50 });
    await api.grantCredit({ meterId: meter.id, customerId: "c1", amount: 25 });
    await api.ingest({ meterId: meter.id, customerId: "c1", value: 10 });
    // Different customer must not be affected
    await api.ingest({ meterId: meter.id, customerId: "c2", value: 999 });

    const c1 = expectOk(await api.balance({ meterId: meter.id, customerId: "c1" }));
    expect(c1.granted).toBe(75);
    expect(c1.consumed).toBe(10);
    expect(c1.balance).toBe(65);

    const c2 = expectOk(await api.balance({ meterId: meter.id, customerId: "c2" }));
    expect(c2.granted).toBe(0);
    expect(c2.consumed).toBe(0); // no ledger → consumption not tracked
    expect(c2.balance).toBe(0);
  });

  it("returns NOT_FOUND for unknown meter on balance/grant", async () => {
    const { api } = setup();

    const balance = await api.balance({ meterId: "nope", customerId: "c1" });
    expect(Result.isError(balance)).toBe(true);

    const grant = await api.grantCredit({ meterId: "nope", customerId: "c1", amount: 10 });
    expect(Result.isError(grant)).toBe(true);
  });

  it("rejects non-positive grant amounts", async () => {
    const { api } = setup();
    const meter = expectOk(
      await api.createMeter({ slug: "b4", name: "B4", eventName: "e" }),
    );

    const result = await api.grantCredit({ meterId: meter.id, customerId: "c1", amount: 0 });
    expect(Result.isError(result)).toBe(true);
  });
});

describe("@hyprpay/meters — events", () => {
  it("emits created / ingested / credit.granted events", async () => {
    const database = createInMemoryMetersAdapter();
    const seen: string[] = [];
    const listener = {
      id: "test-listener",
      namespace: "testListener" as const,
      hooks: {
        onEvent: async (event: { type: string }) => {
          seen.push(event.type);
        },
      },
    };
    const hyprpay = createHyprPay({
      plugins: [meters({ database }), listener] as const,
    });

    const meter = expectOk(
      await hyprpay.api.meters.createMeter({ slug: "ev", name: "EV", eventName: "e" }),
    );
    await hyprpay.api.meters.ingest({ meterId: meter.id, customerId: "c1", value: 1 });
    expectOk(
      await hyprpay.api.meters.grantCredit({ meterId: meter.id, customerId: "c1", amount: 5 }),
    );

    expect(seen).toContain("billing.meter.created");
    expect(seen).toContain("billing.meter.event.ingested");
    expect(seen).toContain("billing.meter.credit.granted");
  });
});
