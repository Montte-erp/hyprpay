import type { BillingResult } from "../results/billing-result";
import type { Checkout } from "../schemas/checkout-schema";

export interface CheckoutListFilter {
  customerId?: string;
  subscriptionId?: string;
}

export interface CheckoutsDatabaseAdapter {
  checkouts: {
    create(input: Checkout): Promise<BillingResult<Checkout>>;
    findById(id: string): Promise<BillingResult<Checkout | null>>;
    list(filter: CheckoutListFilter): Promise<BillingResult<Checkout[]>>;
  };
}

export type CheckoutLookupAdapter = Pick<CheckoutsDatabaseAdapter, "checkouts">;
