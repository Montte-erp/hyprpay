import type { BillingResult } from "../results/billing-result";
import type {
  CancelSubscriptionInput,
  RecordUsageInput,
  Subscription,
  SubscriptionInput,
  UsageRecord,
} from "../schemas/subscription-schema";

export interface SubscriptionsProviderAdapter {
  id: string;
  createSubscription(input: SubscriptionInput & { providerProductId: string }): Promise<BillingResult<Subscription>>;
  cancelSubscription?(input: CancelSubscriptionInput): Promise<BillingResult<Subscription>>;
  recordUsage?(input: RecordUsageInput): Promise<BillingResult<UsageRecord>>;
}
