import type { Subscription } from "../../billing-plugin"

export interface BillingSubscriptionRecord {
  id: string;
  providerSubscriptionId: string | null;
  customerId: string;
  priceId: string;
  paymentMethod: string;
  providerProductId: string | null;
  trialDays: number | null;
  metadata: Record<string, string>;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  trialEndsAt: string | null;
  dunningRetryCount: number;
  lastPaymentError: string | null;
}

export const mapSubscriptionRecord = (record: BillingSubscriptionRecord): Subscription => ({
  id: record.id,
  providerSubscriptionId: record.providerSubscriptionId ?? undefined,
  customerId: record.customerId,
  priceId: record.priceId,
  paymentMethod: record.paymentMethod as Subscription["paymentMethod"],
  providerProductId: record.providerProductId ?? undefined,
  trialDays: record.trialDays ?? undefined,
  metadata: record.metadata,
  status: record.status as Subscription["status"],
  currentPeriodStart: record.currentPeriodStart ?? undefined,
  currentPeriodEnd: record.currentPeriodEnd ?? undefined,
  cancelAtPeriodEnd: record.cancelAtPeriodEnd,
  canceledAt: record.canceledAt ?? undefined,
  endedAt: record.endedAt ?? undefined,
  trialEndsAt: record.trialEndsAt ?? undefined,
  dunningRetryCount: record.dunningRetryCount,
  ...(record.lastPaymentError !== null ? { lastPaymentError: record.lastPaymentError } : {}),
});
