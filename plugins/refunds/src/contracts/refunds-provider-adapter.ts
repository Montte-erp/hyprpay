import type { BillingResult } from "../results/billing-result";
import type { RefundStatus } from "../schemas/refund-schema";

export interface RefundsProviderAdapter {
  id: string;
  createRefund?(input: {
    orderId: string;
    amount: number;
    providerOrderId?: string;
  }): Promise<
    BillingResult<{
      providerRefundId: string;
      // Real PSPs (Pix/boleto/card) settle asynchronously. When the provider can
      // report the initial state, surface it; otherwise the refund stays "pending"
      // until a later transition settles it.
      status?: RefundStatus;
    }>
  >;
}
