import type { BillingResult } from "../results/billing-result";
import type { Charge, ChargeInput } from "../schemas/charge-schema";

export interface ChargesProviderAdapter {
  id: string;
  createCharge(input: ChargeInput): Promise<BillingResult<Charge>>;
}
