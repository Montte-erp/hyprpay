import { Result } from "better-result";
import { z } from "zod";
import type { HyprPayRuntime, HyprPayRuntimeEvent } from "@hyprpay/core";
import type { Benefit } from "./benefit-schema";
import type { BenefitStore } from "./benefit-store";
import type { EntitlementGrant } from "./entitlement-schema";
import type { EntitlementStore } from "./entitlement-store";
import type { EntitlementResult } from "./entitlement-result";
import type { LicenseKeyService } from "./license-key-service";

/**
 * Subscription-shaped payload we consume off the bus. We deliberately re-declare
 * a MINIMAL local schema instead of importing `@hyprpay/subscriptions`: the
 * lifecycle handler listens to events, it does not depend on the producer.
 */
const subscriptionLikeSchema = z
  .object({
    id: z.string().min(1),
    customerId: z.string().min(1),
    priceId: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

/** `billing.subscription.updated` wraps the subscription under `subscription`. */
const subscriptionUpdatedPayloadSchema = z
  .object({
    subscription: subscriptionLikeSchema,
    previous: subscriptionLikeSchema.optional(),
  })
  .passthrough();

/** Refund-shaped payload (`billing.refund.*`). */
const refundLikeSchema = z
  .object({
    id: z.string().min(1),
    orderId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

export type LifecycleSubscription = z.infer<typeof subscriptionLikeSchema>;
export type LifecycleRefund = z.infer<typeof refundLikeSchema>;

/**
 * Resolves which catalog benefits a subscription should grant. The default
 * resolver derives a productId from `metadata.productId` (falling back to
 * `priceId`) and lists benefits attached to it. Override to plug a richer
 * subscription→product mapping without coupling to another plugin.
 */
export type BenefitResolver = (
  subscription: LifecycleSubscription,
  benefits: BenefitStore,
) => Promise<EntitlementResult<Benefit[]>>;

const defaultBenefitResolver: BenefitResolver = async (subscription, benefits) => {
  const productId = subscription.metadata?.productId ?? subscription.priceId;

  if (productId === undefined) {
    return Result.ok([]);
  }

  return Promise.resolve(benefits.listByProduct(productId));
};

/**
 * Maps an event subscription status to whether benefits should be granted
 * (active) or revoked (terminal states). Unknown/undefined status grants —
 * `billing.subscription.created` is treated as an activation.
 */
const isRevokingStatus = (status: string | undefined): boolean =>
  status === "canceled" || status === "expired" || status === "failed";

export interface LifecycleHandlerDeps {
  store: EntitlementStore;
  benefits: BenefitStore;
  licenseKeys: LicenseKeyService;
  resolveBenefits: BenefitResolver;
  customerForRefund?: (refund: LifecycleRefund) => Promise<string | null>;
}

const grantForBenefit = (
  benefit: Benefit,
  subscription: LifecycleSubscription,
): EntitlementGrant => ({
  customerId: subscription.customerId,
  feature: benefit.feature,
  ...(benefit.limit === undefined ? {} : { limit: benefit.limit }),
  benefitId: benefit.id,
  productId: benefit.productId,
  sourceId: subscription.id,
});

const grantBenefits = async (
  deps: LifecycleHandlerDeps,
  subscription: LifecycleSubscription,
): Promise<void> => {
  const benefitsResult = await deps.resolveBenefits(subscription, deps.benefits);

  if (Result.isError(benefitsResult)) {
    return;
  }

  for (const benefit of benefitsResult.value) {
    if (!benefit.active) {
      continue;
    }

    await deps.store.grant(grantForBenefit(benefit, subscription));

    if (benefit.type === "license_key") {
      const expiresAt =
        benefit.expiresInSeconds === undefined
          ? undefined
          : new Date(Date.now() + benefit.expiresInSeconds * 1000).toISOString();

      await deps.licenseKeys.issue({
        benefitId: benefit.id,
        customerId: subscription.customerId,
        ...(benefit.licenseActivationLimit === undefined
          ? {}
          : { activationLimit: benefit.licenseActivationLimit }),
        ...(expiresAt === undefined ? {} : { expiresAt }),
      });
    }
  }
};

const revokeBenefits = async (
  deps: LifecycleHandlerDeps,
  subscription: LifecycleSubscription,
): Promise<void> => {
  const benefitsResult = await deps.resolveBenefits(subscription, deps.benefits);

  if (Result.isError(benefitsResult)) {
    return;
  }

  const revoke = deps.store.revoke;

  if (revoke === undefined) {
    return;
  }

  for (const benefit of benefitsResult.value) {
    await revoke({
      customerId: subscription.customerId,
      feature: benefit.feature,
    });
  }
};

const revokeForRefund = async (
  deps: LifecycleHandlerDeps,
  refund: LifecycleRefund,
): Promise<void> => {
  const customerId =
    refund.customerId ??
    refund.metadata?.customerId ??
    (deps.customerForRefund === undefined ? null : await deps.customerForRefund(refund));

  if (customerId === null || customerId === undefined) {
    return;
  }

  const revoke = deps.store.revoke;

  if (revoke === undefined) {
    return;
  }

  const feature = refund.metadata?.feature;
  const productId = refund.metadata?.productId;

  // Targeted revoke when the refund carries a feature; otherwise revoke every
  // benefit attached to the refunded product.
  if (feature !== undefined) {
    await revoke({ customerId, feature });
    return;
  }

  if (productId === undefined) {
    return;
  }

  const benefitsResult = await deps.benefits.listByProduct(productId);

  if (Result.isError(benefitsResult)) {
    return;
  }

  for (const benefit of benefitsResult.value) {
    await revoke({ customerId, feature: benefit.feature });
  }
};

/**
 * Builds the subscribe-able `onEvent` handler. It grants benefits on
 * subscription activation and revokes them on cancel/refund. Failures inside
 * the handler are swallowed (best-effort, never throws back into the bus).
 */
export const createEntitlementsLifecycleHandler =
  (deps: LifecycleHandlerDeps) =>
  async (event: HyprPayRuntimeEvent, _runtime: HyprPayRuntime): Promise<void> => {
    switch (event.type) {
      case "billing.subscription.created": {
        const parsed = subscriptionLikeSchema.safeParse(event.payload);

        if (parsed.success) {
          await grantBenefits(deps, parsed.data);
        }

        return;
      }
      case "billing.subscription.updated": {
        const parsed = subscriptionUpdatedPayloadSchema.safeParse(event.payload);

        if (!parsed.success) {
          return;
        }

        if (isRevokingStatus(parsed.data.subscription.status)) {
          await revokeBenefits(deps, parsed.data.subscription);
        } else {
          await grantBenefits(deps, parsed.data.subscription);
        }

        return;
      }
      case "billing.subscription.canceled":
      case "billing.subscription.expired": {
        const parsed = subscriptionLikeSchema.safeParse(event.payload);

        if (parsed.success) {
          await revokeBenefits(deps, parsed.data);
        }

        return;
      }
      case "billing.refund.created":
      case "billing.refund.succeeded": {
        const parsed = refundLikeSchema.safeParse(event.payload);

        if (parsed.success) {
          await revokeForRefund(deps, parsed.data);
        }

        return;
      }
      default:
        return;
    }
  };

export { defaultBenefitResolver };
