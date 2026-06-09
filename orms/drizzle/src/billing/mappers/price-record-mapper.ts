import type { Price } from "../../billing-plugin"

export interface BillingPriceRecord {
  id: string;
  productId: string;
  slug: string;
  amount: number;
  currency: string;
  interval: string;
  trialDays: number | null;
  usageBased: boolean;
  billingStrategy: string | null;
  priceType: string;
  minAmount: number | null;
  presetAmount: number | null;
  meterId: string | null;
  unitAmount: number | null;
  providerProductId: string | null;
  metadata: Record<string, string>;
  active: boolean;
}

export const mapPriceRecord = (record: BillingPriceRecord): Price => ({
  id: record.id,
  productId: record.productId,
  slug: record.slug,
  amount: record.amount,
  currency: record.currency as Price["currency"],
  interval: record.interval as Price["interval"],
  trialDays: record.trialDays ?? undefined,
  usageBased: record.usageBased,
  ...(record.billingStrategy !== null ? { billingStrategy: record.billingStrategy as NonNullable<Price["billingStrategy"]> } : {}),
  priceType: record.priceType as Price["priceType"],
  ...(record.minAmount !== null ? { minAmount: record.minAmount } : {}),
  ...(record.presetAmount !== null ? { presetAmount: record.presetAmount } : {}),
  ...(record.meterId !== null ? { meterId: record.meterId } : {}),
  ...(record.unitAmount !== null ? { unitAmount: record.unitAmount } : {}),
  providerProductId: record.providerProductId ?? undefined,
  metadata: record.metadata,
  active: record.active,
});
