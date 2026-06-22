import { Effect } from "effect";
import type { CatalogBenefit, LicenseKeyBenefit } from "../catalog";
import { findPlan, isBenefit } from "../internal/catalog";
import {
  createBenefitGrantRecord,
  createLicenseKeyRecord,
  dateAfterDays,
  now,
} from "../internal/records";
import type { CreateHyprPayOptions } from "../plugin";
import type { BenefitGrant, LicenseKey } from "../schemas";
import type { BillingEffect } from "../store";

const createLicenseKeyFromBenefit = (
  options: CreateHyprPayOptions,
  customerId: string,
  grant: BenefitGrant,
  benefitDefinition: LicenseKeyBenefit,
): BillingEffect<LicenseKey> =>
  options.store.licenseKeys.create(createLicenseKeyRecord({
    customerId,
    benefitId: grant.benefitId,
    ...(benefitDefinition.prefix === undefined ? {} : { prefix: benefitDefinition.prefix }),
    ...(benefitDefinition.limitActivations === undefined
      ? {}
      : { activationsLimit: benefitDefinition.limitActivations }),
    ...(benefitDefinition.limitUsage === undefined ? {} : { usageLimit: benefitDefinition.limitUsage }),
    ...(benefitDefinition.expiresInDays === undefined ? {} : { expiresAt: dateAfterDays(benefitDefinition.expiresInDays) }),
    ...(benefitDefinition.metadata === undefined ? {} : { metadata: benefitDefinition.metadata }),
  }));

export const grantCatalogBenefit = (
  options: CreateHyprPayOptions,
  customerId: string,
  benefitDefinition: CatalogBenefit,
  sourceId: string,
): BillingEffect<void> =>
  Effect.gen(function* () {
    const existing = yield* options.store.benefitGrants.list({
      customerId,
      benefitId: benefitDefinition.id,
      sourceId,
      status: "active",
    });

    if (existing.length > 0) {
      return;
    }

    const grant = yield* options.store.benefitGrants.create(createBenefitGrantRecord({
      customerId,
      benefitId: benefitDefinition.id,
      type: benefitDefinition.type,
      sourceId,
      ...(benefitDefinition.metadata === undefined ? {} : { metadata: benefitDefinition.metadata }),
    }));

    if (benefitDefinition.type === "license_key") {
      yield* createLicenseKeyFromBenefit(options, customerId, grant, benefitDefinition);
    }
  });

export const grantPlanBenefits = (
  options: CreateHyprPayOptions,
  customerId: string,
  planId: string,
  sourceId: string,
): BillingEffect<void> =>
  Effect.gen(function* () {
    const selectedPlan = findPlan(options.catalog ?? [], planId);

    if (selectedPlan === null) {
      return;
    }

    for (const include of selectedPlan.includes) {
      if (isBenefit(include)) {
        yield* grantCatalogBenefit(options, customerId, include, sourceId);
      }
    }
  });

export const revokeSourceBenefits = (options: CreateHyprPayOptions, sourceId: string): BillingEffect<void> =>
  Effect.gen(function* () {
    const grants = yield* options.store.benefitGrants.list({ sourceId, status: "active" });
    const timestamp = now();

    for (const grant of grants) {
      yield* options.store.benefitGrants.update(grant.id, {
        status: "revoked",
        updatedAt: timestamp,
      });

      const licenseKeys = yield* options.store.licenseKeys.list({
        customerId: grant.customerId,
        benefitId: grant.benefitId,
        status: "active",
      });

      for (const licenseKey of licenseKeys) {
        yield* options.store.licenseKeys.update(licenseKey.id, {
          status: "revoked",
          updatedAt: timestamp,
        });
      }
    }
  });
