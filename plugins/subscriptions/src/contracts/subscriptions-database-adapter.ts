import type { BillingResult } from "../results/billing-result";
import type {
  ListSubscriptionsFilter,
  Subscription,
} from "../schemas/subscription-schema";

export interface SubscriptionsDatabaseAdapter {
  subscriptions: {
    create(input: Subscription): Promise<BillingResult<Subscription>>;
    update(input: Subscription): Promise<BillingResult<Subscription>>;
    findById(id: string): Promise<BillingResult<Subscription | null>>;
    list(filter: ListSubscriptionsFilter): Promise<BillingResult<Subscription[]>>;
  };
}

export type SubscriptionLookupAdapter = Pick<SubscriptionsDatabaseAdapter, "subscriptions">;
