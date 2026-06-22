import type { CustomerRef, RefundRef, SubscriptionRef } from "../adapter";
import type { BenefitGrantInput } from "../benefits/schema";
import type { LicenseKeyActivateInput, LicenseKeyIssueInput } from "../license-keys/schema";
import type { MeterRecordInput } from "../meters/schema";
import type { CreateHyprPayOptions } from "../plugin";
import type { PortalSessionInput } from "../portal/schema";
import type { SeatAssignInput } from "../seats/schema";
import type {
  BenefitGrant,
  Checkout,
  CheckoutInput,
  Customer,
  CustomerInput,
  LicenseKey,
  LicenseKeyActivation,
  Order,
  PortalSession,
  Refund,
  RefundInput,
  Seat,
  Subscription,
  SubscriptionInput,
  UsageRecord,
} from "../schemas";

export const now = () => new Date().toISOString();
export const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export const licenseKeyValue = (prefix?: string) => `${prefix ?? "HYP"}_${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;

export const dateAfterDays = (days: number): string => {
  const timestamp = new Date();
  timestamp.setUTCDate(timestamp.getUTCDate() + days);
  return timestamp.toISOString();
};

export const isExpired = (expiresAt?: string): boolean => expiresAt !== undefined && Date.parse(expiresAt) <= Date.now();

export const createCustomerRecord = (input: CustomerInput, providerRef?: CustomerRef): Customer => {
  const timestamp = now();

  return {
    id: id("cus"),
    name: input.name,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
    ...(input.email === undefined ? {} : { email: input.email }),
    ...(input.document === undefined ? {} : { document: input.document }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    ...(providerRef === undefined
      ? {}
      : {
          provider: providerRef.provider,
          providerCustomerId: providerRef.providerCustomerId,
        }),
  };
};

export const createCheckoutRecord = (input: CheckoutInput): Checkout => {
  const timestamp = now();

  return {
    id: id("chk"),
    ...(input.planId === undefined ? {} : { planId: input.planId }),
    customerId: input.customerId,
    amount: input.amount,
    currency: input.currency ?? "BRL",
    ...(input.methods === undefined ? {} : { methods: input.methods }),
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.successUrl === undefined ? {} : { successUrl: input.successUrl }),
    ...(input.cancelUrl === undefined ? {} : { cancelUrl: input.cancelUrl }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
};

export const orderFromCheckout = (checkout: Checkout): Order => {
  const timestamp = now();

  return {
    id: id("ord"),
    customerId: checkout.customerId,
    checkoutId: checkout.id,
    amount: checkout.amount,
    currency: checkout.currency,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(checkout.metadata === undefined ? {} : { metadata: checkout.metadata }),
  };
};

export const createSubscriptionRecord = (input: SubscriptionInput, providerRef?: SubscriptionRef): Subscription => {
  const timestamp = now();

  return {
    id: id("sub"),
    customerId: input.customerId,
    planId: input.planId,
    status: providerRef?.status ?? "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    ...(providerRef === undefined
      ? {}
      : {
          provider: providerRef.provider,
          providerSubscriptionId: providerRef.providerSubscriptionId,
          ...(providerRef.checkoutUrl === undefined ? {} : { checkoutUrl: providerRef.checkoutUrl }),
        }),
  };
};

export const createRefundRecord = (input: RefundInput, providerRef: RefundRef): Refund => {
  const timestamp = now();

  return {
    id: id("ref"),
    orderId: input.orderId,
    provider: providerRef.provider,
    providerRefundId: providerRef.providerRefundId,
    status: providerRef.status,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.amount === undefined ? {} : { amount: input.amount }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
};

export const createBenefitGrantRecord = (input: BenefitGrantInput): BenefitGrant => {
  const timestamp = now();

  return {
    id: id("bgr"),
    customerId: input.customerId,
    benefitId: input.benefitId,
    type: input.type,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
};

export const createUsageRecord = (input: MeterRecordInput): UsageRecord => ({
  id: id("use"),
  customerId: input.customerId,
  meterId: input.meterId,
  amount: input.amount ?? 1,
  createdAt: now(),
  ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
  ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
});

export const createLicenseKeyRecord = (input: LicenseKeyIssueInput): LicenseKey => {
  const timestamp = now();

  return {
    id: id("lic"),
    customerId: input.customerId,
    key: input.key ?? licenseKeyValue(input.prefix),
    status: "active",
    usage: 0,
    validations: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.benefitId === undefined ? {} : { benefitId: input.benefitId }),
    ...(input.activationsLimit === undefined ? {} : { activationsLimit: input.activationsLimit }),
    ...(input.usageLimit === undefined ? {} : { usageLimit: input.usageLimit }),
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
};

export const createLicenseKeyActivationRecord = (
  licenseKeyId: string,
  input: LicenseKeyActivateInput,
): LicenseKeyActivation => {
  const timestamp = now();

  return {
    id: id("lka"),
    licenseKeyId,
    instanceId: input.instanceId,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.label === undefined ? {} : { label: input.label }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
};

export const createSeatRecord = (input: SeatAssignInput): Seat => {
  const timestamp = now();

  return {
    id: id("seat"),
    customerId: input.customerId,
    memberId: input.memberId,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.subscriptionId === undefined ? {} : { subscriptionId: input.subscriptionId }),
    ...(input.email === undefined ? {} : { email: input.email }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
};

export const createPortalSessionRecord = (input: PortalSessionInput, options: CreateHyprPayOptions): PortalSession => {
  const timestamp = now();
  const expiresAt = new Date(Date.now() + (input.expiresInSeconds ?? options.portal?.sessionTtlSeconds ?? 3600) * 1000)
    .toISOString();
  const token = crypto.randomUUID();
  const baseUrl = options.portal?.baseUrl;

  return {
    id: id("cps"),
    customerId: input.customerId,
    token,
    expiresAt,
    createdAt: timestamp,
    ...(baseUrl === undefined ? {} : { url: `${baseUrl}?token=${token}` }),
    ...(input.returnUrl === undefined ? {} : { returnUrl: input.returnUrl }),
  };
};
