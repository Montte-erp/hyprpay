import type { BillingResult } from "../results/billing-result";
import type { BillingEvent } from "../schemas/billing-event-schema";

export interface WebhooksDatabaseAdapter {
  events: {
    append(input: BillingEvent & { externalId: string }): Promise<BillingResult<BillingEvent>>;
    hasProcessed(provider: string, externalId: string): Promise<BillingResult<boolean>>;
  };
}
