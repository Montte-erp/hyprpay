import type { ProductDefinition } from "./catalog";
import { hyprPayCapabilities } from "./capabilities";
import { benefit, feature, plan, product } from "./catalog";
import { benefitsPlugin } from "./benefits/api";
import { checkoutsPlugin } from "./checkouts/api";
import { customersPlugin } from "./customers/api";
import { downloadsPlugin } from "./downloads/api";
import { entitlementsPlugin } from "./entitlements/api";
import { licenseKeysPlugin } from "./license-keys/api";
import { metersPlugin } from "./meters/api";
import { ordersPlugin } from "./orders/api";
import { portalPlugin } from "./portal/api";
import { refundsPlugin } from "./refunds/api";
import { seatsPlugin } from "./seats/api";
import { subscriptionsPlugin } from "./subscriptions/api";
import { webhooksPlugin } from "./webhooks/api";
import type { CreateHyprPayOptions } from "./plugin";

export type {
  CheckoutRef,
  CustomerRef,
  PaymentProviderAdapter,
  ProviderCapabilities,
  ProviderCheckoutInput,
  ProviderSubscriptionInput,
  RefundRef,
  SubscriptionRef,
  WebhookRequest,
} from "./adapter";
export type {
  BenefitGrantInput,
  BenefitRevokeInput,
} from "./benefits/schema";
export type { HyprPayCapabilities } from "./capabilities";
export type {
  BenefitIdFromCatalog,
  BenefitType,
  BooleanFeature,
  BooleanFeatureGrant,
  CatalogBenefit,
  CustomBenefit,
  DiscordRoleBenefit,
  FeatureFlagBenefit,
  FeatureGrant,
  FeatureIdFromCatalog,
  FileDownloadBenefit,
  GithubRepositoryBenefit,
  LicenseKeyBenefit,
  MeterCreditsBenefit,
  MeteredFeature,
  MeteredFeatureGrant,
  PlanDefinition,
  PlanIdFromCatalog,
  PlanInclude,
  PriceInterval,
  ProductDefinition,
  ResetInterval,
  SeatsBenefit,
  SlackChannelBenefit,
} from "./catalog";
export type {
  DownloadAccessInput,
  DownloadAccessResult,
} from "./downloads/schema";
export type {
  EntitlementBalance,
  EntitlementCheckInput,
  EntitlementCheckResult,
  EntitlementReportInput,
  EntitlementReportResult,
} from "./entitlements/schema";
export type {
  LicenseKeyActivateInput,
  LicenseKeyDeactivateInput,
  LicenseKeyIssueInput,
  LicenseKeyValidateInput,
  LicenseKeyValidationResult,
} from "./license-keys/schema";
export type {
  MeterRecordInput,
  MeterSummaryInput,
  MeterSummaryResult,
} from "./meters/schema";
export type {
  CreateHyprPayOptions,
  HyprPayEvents,
  HyprPayPlugin,
  HyprPayPortalOptions,
} from "./plugin";
export type {
  HyprPayTelemetry,
  HyprPayTelemetryEvent,
  HyprPayTelemetryEventName,
} from "./telemetry";
export type { PortalSessionInput } from "./portal/schema";
export type {
  SeatAssignInput,
  SeatRevokeInput,
} from "./seats/schema";
export type {
  BenefitGrant,
  BillingEvent,
  BillingEventInput,
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
} from "./schemas";
export type { BillingEffect, HyprPayStore } from "./store";
export type { HyprPayError } from "./errors";
export {
  capabilityUnsupported,
  CapabilityUnsupported,
  InvalidInput,
  NotFound,
  providerRequestFailed,
  ProviderRequestFailed,
  providerResponseInvalid,
  ProviderResponseInvalid,
  StoreFailed,
  webhookVerificationFailed,
  WebhookVerificationFailed,
} from "./errors";
export { defineHyprPayPlugin } from "./plugin";
export { benefit, feature, hyprPayCapabilities, plan, product };
export { noopHyprPayTelemetry } from "./telemetry";

export const createHyprPay = <const TCatalog extends readonly ProductDefinition[]>(options: CreateHyprPayOptions<TCatalog>) => ({
  capabilities: hyprPayCapabilities,
  catalog: options.catalog ?? [],
  customers: customersPlugin.build(options),
  checkouts: checkoutsPlugin.build(options),
  orders: ordersPlugin.build(options),
  refunds: refundsPlugin.build(options),
  subscriptions: subscriptionsPlugin.build(options),
  webhooks: webhooksPlugin.build(options),
  benefits: benefitsPlugin.build(options),
  entitlements: entitlementsPlugin.build(options),
  meters: metersPlugin.build(options),
  licenseKeys: licenseKeysPlugin.build(options),
  downloads: downloadsPlugin.build(options),
  seats: seatsPlugin.build(options),
  portal: portalPlugin.build(options),
});
