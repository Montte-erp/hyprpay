import { beforeEach, describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import type { DiscountsDatabaseAdapter } from "../src/contracts/discounts-database-adapter";
import { discounts } from "../src/discounts-plugin";
import type { Discount } from "../src/schemas/discount-schema";

const createInMemoryDiscountsAdapter = (): DiscountsDatabaseAdapter => {
  const store = new Map<string, Discount>();

  return {
    discounts: {
      create: async input => {
        store.set(input.id, input);

        return Result.ok(input);
      },
      findById: async id => {
        return Result.ok(store.get(id) ?? null);
      },
      findByCode: async code => {
        for (const discount of store.values()) {
          if (discount.code === code) {
            return Result.ok(discount);
          }
        }

        return Result.ok(null);
      },
      list: async () => {
        return Result.ok([...store.values()]);
      },
      update: async input => {
        store.set(input.id, input);

        return Result.ok(input);
      },
      delete: async id => {
        return Result.ok(store.delete(id));
      },
    },
  };
};

const setup = () => {
  const database = createInMemoryDiscountsAdapter();
  const hyprpay = createHyprPay({
    plugins: [discounts({ database })] as const,
  });

  return { database, api: hyprpay.api.discounts };
};

const ISO_PAST = "2000-01-01T00:00:00.000Z";
const ISO_FUTURE = "2999-01-01T00:00:00.000Z";

describe("@hyprpay/discounts", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("lists created discounts", async () => {
    await ctx.api.create({ code: "WELCOME", type: "percentage", value: 10 });
    await ctx.api.create({ code: "FIXED50", type: "fixed", value: 5000 });

    const listed = await ctx.api.list();

    expect(Result.isOk(listed)).toBe(true);

    if (Result.isError(listed)) {
      throw new Error("expected list to succeed");
    }

    expect(listed.value).toHaveLength(2);
    expect(listed.value.map(discount => discount.code).sort()).toEqual(["FIXED50", "WELCOME"]);
  });

  it("updates mutable fields of an existing discount", async () => {
    const created = await ctx.api.create({ code: "PATCHME", type: "percentage", value: 20 });

    if (Result.isError(created)) {
      throw new Error("expected create to succeed");
    }

    const updated = await ctx.api.update(created.value.id, {
      active: false,
      maxRedemptions: 3,
      metadata: { campaign: "summer" },
    });

    expect(Result.isOk(updated)).toBe(true);

    if (Result.isError(updated)) {
      throw new Error("expected update to succeed");
    }

    expect(updated.value.active).toBe(false);
    expect(updated.value.maxRedemptions).toBe(3);
    expect(updated.value.metadata).toEqual({ campaign: "summer" });
    // identity fields are preserved
    expect(updated.value.code).toBe("PATCHME");
    expect(updated.value.value).toBe(20);
  });

  it("returns NOT_FOUND when updating a missing discount", async () => {
    const updated = await ctx.api.update("missing-id", { active: false });

    expect(Result.isError(updated)).toBe(true);

    if (Result.isOk(updated)) {
      throw new Error("expected update to fail");
    }

    expect(updated.error.error.status).toBe(404);
  });

  it("deletes a discount", async () => {
    const created = await ctx.api.create({ code: "DELME", type: "fixed", value: 1000 });

    if (Result.isError(created)) {
      throw new Error("expected create to succeed");
    }

    const deleted = await ctx.api.delete(created.value.id);

    expect(Result.isOk(deleted)).toBe(true);

    if (Result.isError(deleted)) {
      throw new Error("expected delete to succeed");
    }

    expect(deleted.value).toBe(true);

    const after = await ctx.api.get(created.value.id);

    if (Result.isError(after)) {
      throw new Error("expected get to succeed");
    }

    expect(after.value).toBeNull();
  });

  describe("apply scheduling window", () => {
    it("rejects when current time is before startsAt", async () => {
      await ctx.api.create({
        code: "EARLY",
        type: "percentage",
        value: 10,
        startsAt: ISO_FUTURE,
      });

      const applied = await ctx.api.apply({ code: "EARLY", amount: 10000 });

      expect(Result.isError(applied)).toBe(true);

      if (Result.isOk(applied)) {
        throw new Error("expected apply to fail before window");
      }

      expect(applied.error.error.status).toBe(400);
    });

    it("rejects when current time is after endsAt", async () => {
      await ctx.api.create({
        code: "EXPIRED",
        type: "percentage",
        value: 10,
        endsAt: ISO_PAST,
      });

      const applied = await ctx.api.apply({ code: "EXPIRED", amount: 10000 });

      expect(Result.isError(applied)).toBe(true);
    });

    it("applies inside the window", async () => {
      await ctx.api.create({
        code: "INWINDOW",
        type: "percentage",
        value: 10,
        startsAt: ISO_PAST,
        endsAt: ISO_FUTURE,
      });

      const applied = await ctx.api.apply({ code: "INWINDOW", amount: 10000 });

      expect(Result.isOk(applied)).toBe(true);

      if (Result.isError(applied)) {
        throw new Error("expected apply to succeed inside window");
      }

      expect(applied.value.discountAmount).toBe(1000);
      expect(applied.value.net).toBe(9000);
    });
  });

  it("rejects apply when the discount is inactive", async () => {
    const created = await ctx.api.create({ code: "OFF", type: "percentage", value: 10 });

    if (Result.isError(created)) {
      throw new Error("expected create to succeed");
    }

    await ctx.api.update(created.value.id, { active: false });

    const applied = await ctx.api.apply({ code: "OFF", amount: 10000 });

    expect(Result.isError(applied)).toBe(true);
  });

  describe("apply product scoping", () => {
    it("rejects when productIds are outside the allow-list", async () => {
      await ctx.api.create({
        code: "PROD_ONLY",
        type: "fixed",
        value: 1000,
        restrictedToProductIds: ["prod_a", "prod_b"],
      });

      const applied = await ctx.api.apply({
        code: "PROD_ONLY",
        amount: 10000,
        productIds: ["prod_a", "prod_c"],
      });

      expect(Result.isError(applied)).toBe(true);
    });

    it("rejects when scoped but no productIds are supplied", async () => {
      await ctx.api.create({
        code: "SCOPED",
        type: "fixed",
        value: 1000,
        restrictedToProductIds: ["prod_a"],
      });

      const applied = await ctx.api.apply({ code: "SCOPED", amount: 10000 });

      expect(Result.isError(applied)).toBe(true);
    });

    it("applies when productIds are a subset of the allow-list", async () => {
      await ctx.api.create({
        code: "OK_SCOPE",
        type: "fixed",
        value: 1000,
        restrictedToProductIds: ["prod_a", "prod_b"],
      });

      const applied = await ctx.api.apply({
        code: "OK_SCOPE",
        amount: 10000,
        productIds: ["prod_a"],
      });

      expect(Result.isOk(applied)).toBe(true);

      if (Result.isError(applied)) {
        throw new Error("expected scoped apply to succeed");
      }

      expect(applied.value.discountAmount).toBe(1000);
    });
  });

  describe("apply redemption counting", () => {
    it("increments timesRedeemed atomically on each apply", async () => {
      const created = await ctx.api.create({ code: "COUNT", type: "percentage", value: 10 });

      if (Result.isError(created)) {
        throw new Error("expected create to succeed");
      }

      const first = await ctx.api.apply({ code: "COUNT", amount: 10000 });

      if (Result.isError(first)) {
        throw new Error("expected first apply to succeed");
      }

      expect(first.value.discount.timesRedeemed).toBe(1);

      const second = await ctx.api.apply({ code: "COUNT", amount: 10000 });

      if (Result.isError(second)) {
        throw new Error("expected second apply to succeed");
      }

      expect(second.value.discount.timesRedeemed).toBe(2);

      const fetched = await ctx.api.get(created.value.id);

      if (Result.isError(fetched)) {
        throw new Error("expected get to succeed");
      }

      expect(fetched.value?.timesRedeemed).toBe(2);
    });

    it("rejects apply once maxRedemptions is exhausted", async () => {
      await ctx.api.create({
        code: "ONCE",
        type: "percentage",
        value: 10,
        maxRedemptions: 1,
      });

      const first = await ctx.api.apply({ code: "ONCE", amount: 10000 });

      expect(Result.isOk(first)).toBe(true);

      const second = await ctx.api.apply({ code: "ONCE", amount: 10000 });

      expect(Result.isError(second)).toBe(true);

      if (Result.isOk(second)) {
        throw new Error("expected apply to fail after exhaustion");
      }

      expect(second.error.error.status).toBe(400);
    });
  });

  it("returns NOT_FOUND when applying an unknown code", async () => {
    const applied = await ctx.api.apply({ code: "NOPE", amount: 10000 });

    expect(Result.isError(applied)).toBe(true);

    if (Result.isOk(applied)) {
      throw new Error("expected apply to fail");
    }

    expect(applied.error.error.status).toBe(404);
  });
});
