import { Effect } from "effect";
import type { FeatureGrant, FeatureIdFromCatalog, ProductDefinition } from "../catalog";
import {
  decodeEntitlementCheckInput,
  decodeEntitlementReportInput,
  type EntitlementCheckInput,
  type EntitlementCheckResult,
  type EntitlementReportInput,
  type EntitlementReportResult,
} from "../entitlements/schema";
import { findBenefit, findDefaultGrant, findPlanGrant } from "../internal/catalog";
import { createUsageRecord } from "../internal/records";
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import type { BillingEffect } from "../store";

type EntitlementFeatureId<TCatalog extends readonly ProductDefinition[]> = [FeatureIdFromCatalog<TCatalog>] extends [never]
  ? string
  : FeatureIdFromCatalog<TCatalog>;

const hasActiveFeatureBenefit = (
  options: CreateHyprPayOptions,
  customerId: string,
  featureId: string,
): BillingEffect<boolean> =>
  Effect.gen(function* () {
    const grants = yield* options.store.benefitGrants.list({ customerId, status: "active" });

    for (const grant of grants) {
      const grantBenefit = findBenefit(options.catalog ?? [], grant.benefitId);

      if (grantBenefit?.type === "feature_flag" && grantBenefit.featureId === featureId) {
        return true;
      }
    }

    return false;
  });

const usageForFeature = (
  options: CreateHyprPayOptions,
  customerId: string,
  featureId: string,
): BillingEffect<number> =>
  Effect.gen(function* () {
    const records = yield* options.store.usageRecords.list({ customerId, meterId: `feature:${featureId}` });
    return records.reduce((total, record) => total + record.amount, 0);
  });

const findActivePlanGrant = (
  options: CreateHyprPayOptions,
  customerId: string,
  featureId: string,
): BillingEffect<FeatureGrant | null> =>
  Effect.gen(function* () {
    const subscriptions = yield* options.store.subscriptions.list({ customerId, status: "active" });

    for (const subscription of subscriptions) {
      const grant = findPlanGrant(options.catalog ?? [], subscription.planId, featureId);

      if (grant !== null) {
        return grant;
      }
    }

    return null;
  });

const resolveFeatureGrant = (
  options: CreateHyprPayOptions,
  customerId: string,
  featureId: string,
): BillingEffect<FeatureGrant | null> =>
  Effect.gen(function* () {
    const activeGrant = yield* findActivePlanGrant(options, customerId, featureId);
    return activeGrant ?? findDefaultGrant(options.catalog ?? [], featureId);
  });

export const createEntitlementsApi = <const TCatalog extends readonly ProductDefinition[]>(options: CreateHyprPayOptions<TCatalog>) => {
  const checkParsed = (input: EntitlementCheckInput<string>): BillingEffect<EntitlementCheckResult> =>
    Effect.gen(function* () {
      const parsed = yield* decodeEntitlementCheckInput(input);
      const amount = parsed.amount ?? 1;
      const hasBenefit = yield* hasActiveFeatureBenefit(options, parsed.customerId, parsed.featureId);

      if (hasBenefit) {
        return { allowed: true };
      }

      const grant = yield* resolveFeatureGrant(options, parsed.customerId, parsed.featureId);

      if (grant === null) {
        return {
          allowed: false,
          reason: "feature_not_granted",
        };
      }

      if (grant.type === "boolean") {
        return {
          allowed: true,
        };
      }

      const used = yield* usageForFeature(options, parsed.customerId, parsed.featureId);
      const remaining = Math.max(grant.limit - used, 0);

      if (remaining < amount) {
        return {
          allowed: false,
          balance: {
            limit: grant.limit,
            remaining,
            reset: grant.reset,
            unlimited: false,
          },
          reason: "usage_limit_reached",
        };
      }

      return {
        allowed: true,
        balance: {
          limit: grant.limit,
          remaining,
          reset: grant.reset,
          unlimited: false,
        },
      };
    });

  const check = (
    input: EntitlementCheckInput<EntitlementFeatureId<TCatalog>>,
  ): BillingEffect<EntitlementCheckResult> => checkParsed(input);

  const report = (
    input: EntitlementReportInput<EntitlementFeatureId<TCatalog>>,
  ): BillingEffect<EntitlementReportResult> => Effect.gen(function* () {
    const parsed = yield* decodeEntitlementReportInput(input);
    const meterId = `feature:${parsed.featureId}`;

    if (parsed.idempotencyKey !== undefined) {
      const recorded = yield* options.store.usageRecords.list({
        customerId: parsed.customerId,
        meterId,
        idempotencyKey: parsed.idempotencyKey,
      });

      if (recorded.length > 0) {
        const checked = yield* checkParsed(parsed);
        return {
          ...checked,
          success: true,
        };
      }
    }

    const access = yield* checkParsed(parsed);

    if (!access.allowed) {
      return {
        ...access,
        success: false,
      };
    }

    const grant = yield* resolveFeatureGrant(options, parsed.customerId, parsed.featureId);

    if (grant?.type === "metered") {
      yield* options.store.usageRecords.create(createUsageRecord({
        customerId: parsed.customerId,
        meterId,
        amount: parsed.amount ?? 1,
        ...(parsed.idempotencyKey === undefined ? {} : { idempotencyKey: parsed.idempotencyKey }),
      }));
    }

    const checked = yield* checkParsed(parsed);

    return {
      ...checked,
      success: true,
    };
  });

  return { check, report };
};

export const entitlementsPlugin = defineHyprPayPlugin({
  id: "entitlements",
  build: createEntitlementsApi,
});
