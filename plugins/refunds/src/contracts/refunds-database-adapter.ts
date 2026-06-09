import type { BillingResult } from "../results/billing-result";
import type { Refund, RefundListFilter } from "../schemas/refund-schema";

export interface RefundsDatabaseAdapter {
  refunds: {
    create(input: Refund): Promise<BillingResult<Refund>>;
    findById(id: string): Promise<BillingResult<Refund | null>>;
    // Settles a pending refund into a terminal status (used by transition()).
    update(input: Refund): Promise<BillingResult<Refund>>;
    listByOrder(orderId: string): Promise<BillingResult<Refund[]>>;
    // Broad listing with filters/pagination beyond a single order.
    list(filter: RefundListFilter): Promise<BillingResult<Refund[]>>;
  };
}

export type RefundsLookupAdapter = Pick<RefundsDatabaseAdapter, "refunds">;
