import { Effect } from "effect";
import type { HyprPayError } from "./errors";
import type {
  BenefitGrant,
  BillingEvent,
  Checkout,
  Customer,
  LicenseKey,
  LicenseKeyActivation,
  Order,
  PortalSession,
  Refund,
  Seat,
  Subscription,
  UsageRecord,
} from "./schemas";

export type BillingEffect<TValue> = Effect.Effect<TValue, HyprPayError>;

export interface Repository<TRecord extends { readonly id: string }> {
  create(record: TRecord): BillingEffect<TRecord>;
  update(id: string, patch: Partial<TRecord>): BillingEffect<TRecord>;
  findById(id: string): BillingEffect<TRecord | null>;
  list(filter?: Partial<TRecord>): BillingEffect<readonly TRecord[]>;
}

export interface HyprPayStore {
  readonly customers: Repository<Customer>;
  readonly checkouts: Repository<Checkout>;
  readonly orders: Repository<Order>;
  readonly subscriptions: Repository<Subscription>;
  readonly refunds: Repository<Refund>;
  readonly events: Repository<BillingEvent>;
  readonly benefitGrants: Repository<BenefitGrant>;
  readonly usageRecords: Repository<UsageRecord>;
  readonly licenseKeys: Repository<LicenseKey>;
  readonly licenseKeyActivations: Repository<LicenseKeyActivation>;
  readonly seats: Repository<Seat>;
  readonly portalSessions: Repository<PortalSession>;
}

