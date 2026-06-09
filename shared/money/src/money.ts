/**
 * @hyprpay/money — integer-centavos money math for HyprPay (BRL only).
 *
 * Implementation note: this module implements the frozen public API with
 * **pure integer arithmetic** (round half-up) plus `Intl.NumberFormat` for
 * `formatBRL`, rather than dinero.js v2. The dinero v2 alpha line is declared
 * as a dependency per the package contract, but its alpha typings are risky
 * under `verbatimModuleSyntax` + `exactOptionalPropertyTypes`. The public API
 * is identical to the dinero-backed version and NEVER leaks a Dinero object —
 * every input and output is a plain `number` (integer centavos) or `string`.
 *
 * All amounts are integer centavos. Currency is always the literal `"BRL"`.
 */

/** The single supported currency definition (dinero-shaped: base 10, exponent 2). */
export const BRL: { code: "BRL"; base: 10; exponent: 2 } = {
  code: "BRL",
  base: 10,
  exponent: 2,
};

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Round a rational `numerator / denominator` to the nearest integer using
 * round-half-up (ties go away from zero for positives, toward +∞ overall).
 * Uses pure integer arithmetic to avoid floating-point drift. `denominator`
 * must be a positive integer.
 */
function divRoundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    throw new RangeError("denominator must be a positive integer");
  }

  // round-half-up: floor((2*|n| + d) / (2*d)), sign reapplied afterwards so a
  // tie (.5) always rounds away from zero. Pure integer arithmetic — no floats.
  const sign = numerator < 0 ? -1 : 1;
  const magnitude = Math.abs(numerator);
  const rounded = Math.floor((magnitude * 2 + denominator) / (denominator * 2));
  return sign * rounded;
}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer number of centavos`);
  }
}

/**
 * Format integer centavos as a BRL currency string, e.g. `1000 -> "R$ 10,00"`.
 * Uses pt-BR locale; the non-breaking space produced by Intl is normalized to
 * a regular space for stable, predictable output.
 */
export function formatBRL(centavos: number): string {
  assertInteger(centavos, "centavos");
  const reais = centavos / 100;
  // Replace any non-breaking / narrow-no-break spaces with a normal space.
  return brlFormatter.format(reais).replace(/ | /g, " ");
}

/**
 * `percent` of `centavos`, rounded half-up to whole centavos.
 * `percent` is a percentage value (e.g. `10` means 10%). Fractional percents
 * (e.g. `7.5`) are supported.
 */
export function percentageOf(centavos: number, percent: number): number {
  assertInteger(centavos, "centavos");
  // centavos * percent / 100, kept exact by scaling percent to an integer.
  // Determine the number of decimal places in `percent`.
  const decimals = decimalPlaces(percent);
  const scale = 10 ** decimals;
  const scaledPercent = Math.round(percent * scale);
  const numerator = centavos * scaledPercent;
  const denominator = 100 * scale;
  return divRoundHalfUp(numerator, denominator);
}

/**
 * Apply a discount to `centavos`.
 * - `type: "percentage"`: `value` is a percent (e.g. `10` => 10%).
 * - `type: "fixed"`: `value` is an absolute amount in centavos.
 * Returns the discount amount and the net (clamped to `[0, centavos]`).
 */
export function applyDiscount(
  centavos: number,
  discount: { type: "percentage" | "fixed"; value: number },
): { discountAmount: number; net: number } {
  assertInteger(centavos, "centavos");

  let rawDiscount: number;
  if (discount.type === "percentage") {
    rawDiscount = percentageOf(centavos, discount.value);
  } else {
    assertInteger(discount.value, "discount.value");
    rawDiscount = discount.value;
  }

  const discountAmount = clamp(rawDiscount, 0, centavos);
  const net = centavos - discountAmount;
  return { discountAmount, net };
}

/**
 * Split `centavos` across `ratios` so the returned parts sum **exactly** to
 * `centavos` (largest-remainder method). Each ratio must be >= 0 and at least
 * one must be > 0.
 */
export function allocate(centavos: number, ratios: number[]): number[] {
  assertInteger(centavos, "centavos");

  if (ratios.length === 0) {
    throw new RangeError("ratios must not be empty");
  }

  let total = 0;
  for (const ratio of ratios) {
    if (ratio < 0) {
      throw new RangeError("ratios must be non-negative");
    }
    total += ratio;
  }
  if (total <= 0) {
    throw new RangeError("ratios must contain at least one positive value");
  }

  // Initial floor allocation plus tracked remainders for fair distribution.
  const allocations: number[] = new Array<number>(ratios.length).fill(0);
  const remainders: { index: number; remainder: number }[] = [];
  let allocated = 0;

  for (let i = 0; i < ratios.length; i++) {
    const ratio = ratios[i] ?? 0;
    const share = centavos * ratio;
    const floorShare = Math.floor(share / total);
    allocations[i] = floorShare;
    allocated += floorShare;
    remainders.push({ index: i, remainder: share - floorShare * total });
  }

  let leftover = centavos - allocated;

  // Distribute the leftover centavos to the largest remainders first.
  remainders.sort((a, b) => b.remainder - a.remainder);
  let cursor = 0;
  while (leftover > 0 && remainders.length > 0) {
    const entry = remainders[cursor % remainders.length];
    if (entry !== undefined) {
      const current = allocations[entry.index] ?? 0;
      allocations[entry.index] = current + 1;
      leftover -= 1;
    }
    cursor += 1;
  }

  return allocations;
}

/**
 * Prorate `amount` for the portion of `[periodStart, periodEnd)` remaining at
 * `changeAt`, rounded half-up. Dates are ISO strings. If `changeAt` is before
 * the period start the full amount is returned; if after the end, `0`.
 */
export function prorate(input: {
  periodStart: string;
  periodEnd: string;
  changeAt: string;
  amount: number;
}): number {
  assertInteger(input.amount, "amount");

  const start = Date.parse(input.periodStart);
  const end = Date.parse(input.periodEnd);
  const change = Date.parse(input.changeAt);

  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(change)) {
    throw new TypeError("prorate received an invalid ISO date string");
  }
  if (end <= start) {
    throw new RangeError("periodEnd must be after periodStart");
  }

  const periodMs = end - start;
  const remainingMs = clamp(end - change, 0, periodMs);

  // amount * remainingMs / periodMs, round half-up via integer arithmetic.
  return divRoundHalfUp(input.amount * remainingMs, periodMs);
}

/** Sum integer-centavos amounts. Empty call returns `0`. */
export function sumAmounts(...amounts: number[]): number {
  let total = 0;
  for (const amount of amounts) {
    assertInteger(amount, "amount");
    total += amount;
  }
  return total;
}

/** `unitAmount * quantity` in centavos. `quantity` must be a non-negative integer. */
export function multiplyQuantity(unitAmount: number, quantity: number): number {
  assertInteger(unitAmount, "unitAmount");
  assertInteger(quantity, "quantity");
  if (quantity < 0) {
    throw new RangeError("quantity must be non-negative");
  }
  return unitAmount * quantity;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function decimalPlaces(value: number): number {
  if (Number.isInteger(value)) {
    return 0;
  }
  const text = Math.abs(value).toString();
  const dotIndex = text.indexOf(".");
  if (dotIndex === -1) {
    // Scientific notation fallback (e.g. very small fractions).
    const match = /e-(\d+)$/i.exec(text);
    if (match?.[1] !== undefined) {
      return Number.parseInt(match[1], 10);
    }
    return 0;
  }
  return text.length - dotIndex - 1;
}
