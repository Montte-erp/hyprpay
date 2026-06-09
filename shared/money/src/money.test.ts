import { describe, expect, test } from "bun:test";
import {
  BRL,
  allocate,
  applyDiscount,
  formatBRL,
  multiplyQuantity,
  percentageOf,
  prorate,
  sumAmounts,
} from "./money";

describe("BRL", () => {
  test("is the frozen dinero-shaped currency definition", () => {
    expect(BRL).toEqual({ code: "BRL", base: 10, exponent: 2 });
  });
});

describe("formatBRL", () => {
  test("formats whole reais", () => {
    expect(formatBRL(1000)).toBe("R$ 10,00");
  });

  test("formats fractional centavos", () => {
    expect(formatBRL(1)).toBe("R$ 0,01");
    expect(formatBRL(12345)).toBe("R$ 123,45");
  });

  test("formats zero", () => {
    expect(formatBRL(0)).toBe("R$ 0,00");
  });

  test("formats thousands with the pt-BR grouping separator", () => {
    expect(formatBRL(100000000)).toBe("R$ 1.000.000,00");
  });
});

describe("percentageOf", () => {
  test("computes a simple percentage", () => {
    expect(percentageOf(1000, 10)).toBe(100);
  });

  test("rounds half-up", () => {
    // 5% of 1005 = 50.25 -> 50
    expect(percentageOf(1005, 5)).toBe(50);
    // 50% of 101 = 50.5 -> 51 (tie rounds up)
    expect(percentageOf(101, 50)).toBe(51);
  });

  test("supports fractional percents", () => {
    // 7.5% of 1000 = 75
    expect(percentageOf(1000, 7.5)).toBe(75);
    // 8.25% of 13333 = 1099.9725 -> 1100
    expect(percentageOf(13333, 8.25)).toBe(1100);
  });

  test("0% is 0 and 100% is the input", () => {
    expect(percentageOf(9999, 0)).toBe(0);
    expect(percentageOf(9999, 100)).toBe(9999);
  });
});

describe("applyDiscount", () => {
  test("percentage discount", () => {
    expect(applyDiscount(1000, { type: "percentage", value: 25 })).toEqual({
      discountAmount: 250,
      net: 750,
    });
  });

  test("fixed discount", () => {
    expect(applyDiscount(1000, { type: "fixed", value: 300 })).toEqual({
      discountAmount: 300,
      net: 700,
    });
  });

  test("clamps a fixed discount larger than the amount to never go negative", () => {
    expect(applyDiscount(500, { type: "fixed", value: 900 })).toEqual({
      discountAmount: 500,
      net: 0,
    });
  });

  test("percentage discount rounds half-up", () => {
    // 50% of 101 = 50.5 -> 51
    expect(applyDiscount(101, { type: "percentage", value: 50 })).toEqual({
      discountAmount: 51,
      net: 50,
    });
  });
});

describe("allocate", () => {
  test("splits evenly with no remainder", () => {
    const parts = allocate(1000, [1, 1]);
    expect(parts).toEqual([500, 500]);
    expect(sumAmounts(...parts)).toBe(1000);
  });

  test("distributes the leftover centavo (sums to input)", () => {
    const parts = allocate(1001, [1, 1]);
    expect(sumAmounts(...parts)).toBe(1001);
    expect(parts).toEqual([501, 500]);
  });

  test("weighted ratios still sum exactly to the input", () => {
    const total = 10000;
    const parts = allocate(total, [3, 5, 2]);
    expect(sumAmounts(...parts)).toBe(total);
    expect(parts).toEqual([3000, 5000, 2000]);
  });

  test("awkward division sums to input", () => {
    const total = 100;
    const parts = allocate(total, [1, 1, 1]);
    expect(sumAmounts(...parts)).toBe(total);
    expect(parts).toEqual([34, 33, 33]);
  });

  test("handles a zero ratio bucket", () => {
    const parts = allocate(1000, [0, 1, 1]);
    expect(sumAmounts(...parts)).toBe(1000);
    expect(parts[0]).toBe(0);
  });
});

describe("prorate", () => {
  const periodStart = "2026-01-01T00:00:00.000Z";
  const periodEnd = "2026-01-31T00:00:00.000Z"; // 30-day period

  test("returns the full amount when change is at period start", () => {
    expect(
      prorate({ periodStart, periodEnd, changeAt: periodStart, amount: 3000 }),
    ).toBe(3000);
  });

  test("returns zero when change is at or after period end", () => {
    expect(
      prorate({ periodStart, periodEnd, changeAt: periodEnd, amount: 3000 }),
    ).toBe(0);
    expect(
      prorate({
        periodStart,
        periodEnd,
        changeAt: "2026-02-15T00:00:00.000Z",
        amount: 3000,
      }),
    ).toBe(0);
  });

  test("returns the full amount when change is before the period", () => {
    expect(
      prorate({
        periodStart,
        periodEnd,
        changeAt: "2025-12-01T00:00:00.000Z",
        amount: 3000,
      }),
    ).toBe(3000);
  });

  test("prorates the remaining portion of the period", () => {
    // change at the midpoint (day 15 of 30) => half remaining => 1500
    expect(
      prorate({
        periodStart,
        periodEnd,
        changeAt: "2026-01-16T00:00:00.000Z",
        amount: 3000,
      }),
    ).toBe(1500);
  });
});

describe("multiplyQuantity", () => {
  test("multiplies unit amount by quantity", () => {
    expect(multiplyQuantity(250, 4)).toBe(1000);
    expect(multiplyQuantity(999, 0)).toBe(0);
  });
});

describe("sumAmounts", () => {
  test("sums amounts, empty is zero", () => {
    expect(sumAmounts()).toBe(0);
    expect(sumAmounts(100, 200, 300)).toBe(600);
  });
});
