import type { BillingResult } from "../results/billing-result";
import type { Checkout, CheckoutInput } from "../schemas/checkout-schema";

/**
 * Input handed to the provider when creating a checkout session. Besides the
 * validated `CheckoutInput`, the plugin resolves `providerProductId` and the
 * authoritative `amount` (centavos, after PWYW/custom-amount + discount) so the
 * provider charges exactly what the plugin computed.
 */
export type CheckoutProviderCreateInput = CheckoutInput & {
  providerProductId: string;
  amount: number;
};

export interface CheckoutsProviderAdapter {
  id: string;
  createCheckout(input: CheckoutProviderCreateInput): Promise<BillingResult<Checkout>>;
}
