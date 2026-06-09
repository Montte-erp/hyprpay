import type { BillingResult } from "../results/billing-result";
import type {
  Meter,
  MeterCredit,
  MeterEvent,
  UsageSnapshot,
} from "../schemas/meter-schema";

export interface MeterEventPeriodQuery {
  meterId: string;
  subscriptionId?: string;
  customerId?: string;
  periodStart: string;
  periodEnd: string;
}

export interface MeterCreditKey {
  meterId: string;
  customerId: string;
}

export interface MetersDatabaseAdapter {
  meters: {
    create(input: Meter): Promise<BillingResult<Meter>>;
    findById(id: string): Promise<BillingResult<Meter | null>>;
    findBySlug(slug: string): Promise<BillingResult<Meter | null>>;
  };
  meterEvents: {
    append(input: MeterEvent): Promise<BillingResult<MeterEvent>>;
    listForPeriod(input: MeterEventPeriodQuery): Promise<BillingResult<MeterEvent[]>>;
    findByIdempotencyKey(key: string): Promise<BillingResult<MeterEvent | null>>;
  };
  snapshots: {
    create(input: UsageSnapshot): Promise<BillingResult<UsageSnapshot>>;
  };
  credits: {
    find(key: MeterCreditKey): Promise<BillingResult<MeterCredit | null>>;
    upsert(input: MeterCredit): Promise<BillingResult<MeterCredit>>;
  };
}
