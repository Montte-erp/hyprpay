import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntimeEvent } from "@hyprpay/core";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import { seats } from "../src/seats-plugin";
import type { SeatPlanInput } from "../src/schemas/seat-schema";
import { createInMemorySeatsAdapter, type InMemorySeatsAdapter } from "./in-memory-seats-adapter";

/** Records every runtime event so specs can assert seat lifecycle emissions. */
const eventRecorder = (): {
  plugin: HyprPayPlugin<"seatEvents", Record<string, never>>;
  events: HyprPayRuntimeEvent[];
} => {
  const events: HyprPayRuntimeEvent[] = [];
  return {
    events,
    plugin: {
      id: "seat-events",
      namespace: "seatEvents",
      hooks: {
        onEvent: async event => {
          events.push(event);
        },
      },
    },
  };
};

const setup = () => {
  const database = createInMemorySeatsAdapter();
  const recorder = eventRecorder();
  const hyprpay = createHyprPay({
    plugins: [seats({ database }), recorder.plugin] as const,
  });
  return { api: hyprpay.api.seats, database, events: recorder.events };
};

const createPlan = async (
  api: ReturnType<typeof setup>["api"],
  overrides: Partial<SeatPlanInput> = {},
) => {
  const result = await api.createPlan({
    priceId: "price_seat",
    includedSeats: 0,
    perSeatAmount: 1000,
    ...overrides,
  });

  if (Result.isError(result)) {
    throw new Error("expected plan creation to succeed");
  }

  return result.value;
};

const assignN = async (
  api: ReturnType<typeof setup>["api"],
  subscriptionId: string,
  count: number,
) => {
  for (let i = 0; i < count; i++) {
    const assigned = await api.assign({ subscriptionId, memberId: `member_${i}` });
    if (Result.isError(assigned)) {
      throw new Error("expected assign to succeed");
    }
  }
};

const unwrapOk = <T>(result: Result<T, unknown>): T => {
  if (Result.isError(result)) {
    throw new Error("expected ok result");
  }
  return result.value;
};

describe("@hyprpay/seats — plan + assign + count + quote", () => {
  it("flat per-seat pricing charges max(0, active - included) * perSeatAmount", async () => {
    const { api } = setup();
    const plan = await createPlan(api, { includedSeats: 2, perSeatAmount: 1500 });

    await assignN(api, "sub_1", 5);

    const quote = unwrapOk(await api.quote({ subscriptionId: "sub_1", planId: plan.id }));

    expect(quote.seats).toBe(5);
    expect(quote.billableSeats).toBe(3);
    expect(quote.amount).toBe(4500); // 3 billable * 1500
    expect(quote.proratedAmount).toBe(4500);
  });

  it("count reflects only active assignments and is idempotent per member", async () => {
    const { api } = setup();
    await createPlan(api);

    const first = await api.assign({ subscriptionId: "sub_1", memberId: "m1" });
    const second = await api.assign({ subscriptionId: "sub_1", memberId: "m1" });

    expect(unwrapOk(first).id).toBe(unwrapOk(second).id);
    expect(unwrapOk(await api.count("sub_1"))).toBe(1);
  });

  it("rejects tiered/volume plans without tiers", async () => {
    const { api } = setup();
    const result = await api.createPlan({
      priceId: "price_seat",
      perSeatAmount: 1000,
      pricingMode: "volume",
    });

    expect(Result.isError(result)).toBe(true);
  });
});

describe("@hyprpay/seats — tiered & volume pricing", () => {
  it("volume pricing applies the matching band's unit price to all billable seats", async () => {
    const { api } = setup();
    const plan = await createPlan(api, {
      perSeatAmount: 1000,
      pricingMode: "volume",
      tiers: [
        { upTo: 3, unitAmount: 1000 },
        { upTo: 10, unitAmount: 800 },
        { unitAmount: 500 },
      ],
    });

    await assignN(api, "sub_1", 5);

    const quote = unwrapOk(await api.quote({ subscriptionId: "sub_1", planId: plan.id }));
    // 5 seats land in the up-to-10 band → 5 * 800
    expect(quote.amount).toBe(4000);
  });

  it("volume pricing uses the open-ended band above the last bound", async () => {
    const { api } = setup();
    const plan = await createPlan(api, {
      perSeatAmount: 1000,
      pricingMode: "volume",
      tiers: [
        { upTo: 3, unitAmount: 1000 },
        { upTo: 10, unitAmount: 800 },
        { unitAmount: 500 },
      ],
    });

    await assignN(api, "sub_1", 12);

    const quote = unwrapOk(await api.quote({ subscriptionId: "sub_1", planId: plan.id }));
    // 12 seats → open-ended band → 12 * 500
    expect(quote.amount).toBe(6000);
  });

  it("tiered (graduated) pricing bills band-by-band and sums", async () => {
    const { api } = setup();
    const plan = await createPlan(api, {
      perSeatAmount: 1000,
      pricingMode: "tiered",
      tiers: [
        { upTo: 3, unitAmount: 1000 },
        { upTo: 10, unitAmount: 800 },
        { unitAmount: 500 },
      ],
    });

    await assignN(api, "sub_1", 5);

    const quote = unwrapOk(await api.quote({ subscriptionId: "sub_1", planId: plan.id }));
    // 3 * 1000 + 2 * 800 = 4600
    expect(quote.amount).toBe(4600);
  });

  it("tiered pricing crosses into the open-ended band", async () => {
    const { api } = setup();
    const plan = await createPlan(api, {
      perSeatAmount: 1000,
      pricingMode: "tiered",
      tiers: [
        { upTo: 3, unitAmount: 1000 },
        { upTo: 10, unitAmount: 800 },
        { unitAmount: 500 },
      ],
    });

    await assignN(api, "sub_1", 12);

    const quote = unwrapOk(await api.quote({ subscriptionId: "sub_1", planId: plan.id }));
    // 3*1000 + 7*800 + 2*500 = 3000 + 5600 + 1000 = 9600
    expect(quote.amount).toBe(9600);
  });
});

describe("@hyprpay/seats — proration", () => {
  it("prorates the seat charge for the remaining portion of the cycle", async () => {
    const { api } = setup();
    const plan = await createPlan(api, { perSeatAmount: 3000 });

    await assignN(api, "sub_1", 1); // full = 3000

    const quote = unwrapOk(
      await api.quote({
        subscriptionId: "sub_1",
        planId: plan.id,
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-01-31T00:00:00.000Z",
        changeAt: "2026-01-16T00:00:00.000Z", // 15 of 30 days remain
      }),
    );

    expect(quote.amount).toBe(3000);
    expect(quote.proratedAmount).toBe(1500);
  });

  it("falls back to the full amount on a degenerate window", async () => {
    const { api } = setup();
    const plan = await createPlan(api, { perSeatAmount: 3000 });

    await assignN(api, "sub_1", 1);

    const quote = unwrapOk(
      await api.quote({
        subscriptionId: "sub_1",
        planId: plan.id,
        periodStart: "2026-01-31T00:00:00.000Z",
        periodEnd: "2026-01-01T00:00:00.000Z", // end before start
        changeAt: "2026-01-16T00:00:00.000Z",
      }),
    );

    expect(quote.proratedAmount).toBe(3000);
  });
});

describe("@hyprpay/seats — charge", () => {
  it("creates a charge line for billable seats and emits billing.seat.charged", async () => {
    const { api, database, events } = setup();
    const plan = await createPlan(api, { includedSeats: 1, perSeatAmount: 2000 });

    await assignN(api, "sub_1", 3);

    const charge = unwrapOk(await api.charge({ subscriptionId: "sub_1", planId: plan.id }));

    expect(charge.billableSeats).toBe(2);
    expect(charge.amount).toBe(4000);
    expect(charge.currency).toBe("BRL");
    expect((database as InMemorySeatsAdapter).charges.all()).toHaveLength(1);
    expect(events.some(e => e.type === "billing.seat.charged")).toBe(true);
  });

  it("creates a prorated charge line when a change window is supplied", async () => {
    const { api } = setup();
    const plan = await createPlan(api, { perSeatAmount: 3000 });

    await assignN(api, "sub_1", 1);

    const charge = unwrapOk(
      await api.charge({
        subscriptionId: "sub_1",
        planId: plan.id,
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-01-31T00:00:00.000Z",
        changeAt: "2026-01-16T00:00:00.000Z",
      }),
    );

    expect(charge.amount).toBe(1500);
    expect(charge.proratedFromSeats).toBe(1);
  });

  it("returns NOT_FOUND when the plan is missing", async () => {
    const { api } = setup();
    const result = await api.charge({ subscriptionId: "sub_1", planId: "missing" });
    expect(Result.isError(result)).toBe(true);
  });
});

describe("@hyprpay/seats — invitation flow", () => {
  it("invite creates a pending invitation and claim turns it into an active seat", async () => {
    const { api, events } = setup();
    await createPlan(api);

    const invitation = unwrapOk(
      await api.invite({ subscriptionId: "sub_1", memberEmail: "new@member.com" }),
    );

    expect(invitation.status).toBe("pending");
    expect(invitation.token.length).toBeGreaterThan(0);
    expect(unwrapOk(await api.count("sub_1"))).toBe(0);

    const assignment = unwrapOk(
      await api.claim({ token: invitation.token, memberId: "member_x" }),
    );

    expect(assignment.status).toBe("active");
    expect(assignment.memberEmail).toBe("new@member.com");
    expect(unwrapOk(await api.count("sub_1"))).toBe(1);
    expect(events.some(e => e.type === "billing.seat.invited")).toBe(true);
    expect(events.some(e => e.type === "billing.seat.claimed")).toBe(true);
  });

  it("invite is idempotent for a pending (subscription, email)", async () => {
    const { api } = setup();
    await createPlan(api);

    const first = unwrapOk(
      await api.invite({ subscriptionId: "sub_1", memberEmail: "dup@member.com" }),
    );
    const second = unwrapOk(
      await api.invite({ subscriptionId: "sub_1", memberEmail: "dup@member.com" }),
    );

    expect(first.id).toBe(second.id);
  });

  it("claiming an already-claimed invitation is rejected", async () => {
    const { api } = setup();
    await createPlan(api);

    const invitation = unwrapOk(
      await api.invite({ subscriptionId: "sub_1", memberEmail: "once@member.com" }),
    );

    unwrapOk(await api.claim({ token: invitation.token, memberId: "member_y" }));

    const second = await api.claim({ token: invitation.token, memberId: "member_z" });
    expect(Result.isError(second)).toBe(true);
  });

  it("claiming an unknown token returns NOT_FOUND", async () => {
    const { api } = setup();
    const result = await api.claim({ token: "nope", memberId: "member_q" });
    expect(Result.isError(result)).toBe(true);
  });
});

describe("@hyprpay/seats — revoke", () => {
  it("revokes an active seat and emits billing.seat.revoked", async () => {
    const { api, events } = setup();
    await createPlan(api);

    const assignment = unwrapOk(
      await api.assign({ subscriptionId: "sub_1", memberId: "m1" }),
    );

    const revoked = unwrapOk(await api.revoke({ assignmentId: assignment.id }));

    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).toBeDefined();
    expect(unwrapOk(await api.count("sub_1"))).toBe(0);
    expect(events.some(e => e.type === "billing.seat.revoked")).toBe(true);
  });

  it("returns NOT_FOUND for an unknown assignment", async () => {
    const { api } = setup();
    const result = await api.revoke({ assignmentId: "missing" });
    expect(Result.isError(result)).toBe(true);
  });
});
