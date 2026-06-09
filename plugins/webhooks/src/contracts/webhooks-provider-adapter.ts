import type { BillingResult } from "../results/billing-result";
import type { BillingEvent } from "../schemas/billing-event-schema";

export interface WebhooksProviderAdapter {
  id: string;
  verifyWebhook?(request: Request): Promise<BillingResult<void>>;
  parseWebhook(request: Request): Promise<BillingResult<BillingEvent>>;
}
