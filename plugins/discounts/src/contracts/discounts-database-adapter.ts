import type { BillingResult } from "../results/billing-result";
import type { Discount } from "../schemas/discount-schema";

export interface DiscountsDatabaseAdapter {
  discounts: {
    create(input: Discount): Promise<BillingResult<Discount>>;
    findById(id: string): Promise<BillingResult<Discount | null>>;
    findByCode(code: string): Promise<BillingResult<Discount | null>>;
    list(): Promise<BillingResult<Discount[]>>;
    update(input: Discount): Promise<BillingResult<Discount>>;
    delete(id: string): Promise<BillingResult<boolean>>;
  };
}

export type DiscountLookupAdapter = Pick<DiscountsDatabaseAdapter, "discounts">;
