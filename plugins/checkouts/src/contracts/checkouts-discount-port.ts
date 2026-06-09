import type { BillingResult } from "../results/billing-result";

/**
 * Minimal shape of a resolved discount as consumed by checkout. This is a
 * structural subset of the discounts plugin's `Discount` — checkout only needs
 * the fields it persists/echoes, so it stays decoupled from `@hyprpay/discounts`
 * internals (the integration layer wires `hyprpay.api.discounts`, which matches
 * this port structurally).
 */
export interface CheckoutResolvedDiscount {
  id: string;
  code: string;
}

/**
 * Result of applying a discount to a gross amount. Matches the discounts plugin's
 * `apply` return shape structurally.
 */
export interface CheckoutDiscountApplication {
  discountAmount: number;
  net: number;
  discount: CheckoutResolvedDiscount;
}

/**
 * Port the checkout plugin uses to resolve + apply discounts. Structurally
 * compatible with `DiscountsApi` from `@hyprpay/discounts`, so the composition
 * root can pass `hyprpay.api.discounts` directly. Optional on the plugin options:
 * when absent, supplying `discountId`/`discountCode` is rejected as invalid input.
 */
export interface CheckoutDiscountPort {
  get(id: string): Promise<BillingResult<CheckoutResolvedDiscount | null>>;
  findByCode(code: string): Promise<BillingResult<CheckoutResolvedDiscount | null>>;
  apply(input: {
    code: string;
    amount: number;
  }): Promise<BillingResult<CheckoutDiscountApplication>>;
}
