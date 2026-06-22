import { Effect } from "effect";
import { invalidInput, notFound } from "../errors";
import { decodeLicenseKeyActivateInput,
decodeLicenseKeyDeactivateInput,
decodeLicenseKeyIssueInput,
decodeLicenseKeyValidateInput,
type LicenseKeyActivateInput,
type LicenseKeyDeactivateInput,
type LicenseKeyIssueInput,
type LicenseKeyValidateInput,
type LicenseKeyValidationResult, } from "../license-keys/schema"
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import {
  createLicenseKeyActivationRecord,
  createLicenseKeyRecord,
  isExpired,
  now,
} from "../internal/records";
import type { LicenseKey } from "../schemas";
import type { BillingEffect } from "../store";

const activeLicenseKeyFromInput = (
  options: CreateHyprPayOptions,
  key: string,
): BillingEffect<LicenseKey | null> =>
  Effect.gen(function* () {
    const matches = yield* options.store.licenseKeys.list({ key });
    const licenseKey = matches[0];

    if (licenseKey === undefined) {
      return null;
    }

    if (licenseKey.status === "active" && isExpired(licenseKey.expiresAt)) {
      return yield* options.store.licenseKeys.update(licenseKey.id, {
        status: "expired",
        updatedAt: now(),
      });
    }

    return licenseKey;
  });

export const createLicenseKeysApi = (options: CreateHyprPayOptions) => ({
  issue: (input: LicenseKeyIssueInput): BillingEffect<LicenseKey> => Effect.gen(function* () {
    const parsed = yield* decodeLicenseKeyIssueInput(input);
    const customer = yield* options.store.customers.findById(parsed.customerId);

    if (customer === null) {
      return yield* Effect.fail(notFound());
    }

    return yield* options.store.licenseKeys.create(createLicenseKeyRecord(parsed));
  }),
  validate: (input: LicenseKeyValidateInput): BillingEffect<LicenseKeyValidationResult> => Effect.gen(function* () {
    const parsed = yield* decodeLicenseKeyValidateInput(input);
    const licenseKey = yield* activeLicenseKeyFromInput(options, parsed.key);

    if (licenseKey === null) {
      return { valid: false, reason: "not_found" };
    }

    if (licenseKey.status === "revoked") {
      return { valid: false, licenseKey, reason: "revoked" };
    }

    if (licenseKey.status === "expired") {
      return { valid: false, licenseKey, reason: "expired" };
    }

    const activation =
      parsed.activationId === undefined
        ? undefined
        : yield* options.store.licenseKeyActivations.findById(parsed.activationId);

    if (licenseKey.activationsLimit !== undefined) {
      if (activation === undefined || activation === null || activation.licenseKeyId !== licenseKey.id || activation.status !== "active") {
        return { valid: false, licenseKey, reason: "activation_required" };
      }
    }

    const usageIncrement = parsed.incrementUsage ?? 0;

    if (licenseKey.usageLimit !== undefined && licenseKey.usage + usageIncrement > licenseKey.usageLimit) {
      return { valid: false, licenseKey, ...(activation === undefined || activation === null ? {} : { activation }), reason: "usage_limit_reached" };
    }

    const updated = yield* options.store.licenseKeys.update(licenseKey.id, {
      validations: licenseKey.validations + 1,
      usage: licenseKey.usage + usageIncrement,
      lastValidatedAt: now(),
      updatedAt: now(),
    });

    return {
      valid: true,
      licenseKey: updated,
      ...(activation === undefined || activation === null ? {} : { activation }),
    };
  }),
  activate: (input: LicenseKeyActivateInput) => Effect.gen(function* () {
    const parsed = yield* decodeLicenseKeyActivateInput(input);
    const licenseKey = yield* activeLicenseKeyFromInput(options, parsed.key);

    if (licenseKey === null || licenseKey.status !== "active") {
      return yield* Effect.fail(notFound());
    }

    const existing = yield* options.store.licenseKeyActivations.list({
      licenseKeyId: licenseKey.id,
      instanceId: parsed.instanceId,
      status: "active",
    });
    const activation = existing[0];

    if (activation !== undefined) {
      return activation;
    }

    if (licenseKey.activationsLimit !== undefined) {
      const activeActivations = yield* options.store.licenseKeyActivations.list({
        licenseKeyId: licenseKey.id,
        status: "active",
      });

      if (activeActivations.length >= licenseKey.activationsLimit) {
        return yield* Effect.fail(invalidInput());
      }
    }

    return yield* options.store.licenseKeyActivations.create(createLicenseKeyActivationRecord(licenseKey.id, parsed));
  }),
  deactivate: (input: LicenseKeyDeactivateInput) => Effect.gen(function* () {
    const parsed = yield* decodeLicenseKeyDeactivateInput(input);
    const activation = yield* options.store.licenseKeyActivations.findById(parsed.activationId);

    if (activation === null) {
      return yield* Effect.fail(notFound());
    }

    return yield* options.store.licenseKeyActivations.update(parsed.activationId, {
      status: "deactivated",
      updatedAt: now(),
    });
  }),
  list: (filter?: Partial<LicenseKey>): BillingEffect<readonly LicenseKey[]> =>
    options.store.licenseKeys.list(filter),
});

export const licenseKeysPlugin = defineHyprPayPlugin({
  id: "license-keys",
  build: createLicenseKeysApi,
});
