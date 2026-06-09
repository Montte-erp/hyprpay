import type { BillingResult } from "../results/billing-result";
import type { Charge } from "../schemas/charge-schema";

export interface ChargesDatabaseAdapter {
  charges: {
    create(input: Charge): Promise<BillingResult<Charge>>;
    update(input: Charge): Promise<BillingResult<Charge>>;
    findById(id: string): Promise<BillingResult<Charge | null>>;
  };
}

export type ChargeLookupAdapter = Pick<ChargesDatabaseAdapter, "charges">;
