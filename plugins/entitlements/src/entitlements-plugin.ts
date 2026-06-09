import { Result } from "better-result";
import type { HyprPayPlugin } from "@hyprpay/core";
import {
  type Benefit,
  type BenefitInput,
  benefitInputSchema,
  benefitSchema,
  benefitTypeSchema,
} from "./benefit-schema";
import type { BenefitStore } from "./benefit-store";
import { entitlementErrors } from "./entitlement-error-catalog";
import { EntitlementError } from "./entitlement-errors";
import type { EntitlementResult } from "./entitlement-result";
import type { EntitlementStore } from "./entitlement-store";
import {
  type EntitlementCheck,
  type EntitlementCheckInput,
  type EntitlementConsumeInput,
  type EntitlementGrant,
  type EntitlementRevokeInput,
  entitlementCheckInputSchema,
  entitlementCheckSchema,
  entitlementConsumeInputSchema,
  entitlementGrantSchema,
  entitlementRevokeInputSchema,
} from "./entitlement-schema";
import { createInMemoryBenefitStore } from "./in-memory-benefit-store";
import { createInMemoryEntitlementStore } from "./in-memory-entitlement-store";
import { createInMemoryLicenseKeyStore } from "./in-memory-license-key-store";
import {
  type BenefitResolver,
  type LifecycleRefund,
  createEntitlementsLifecycleHandler,
  defaultBenefitResolver,
} from "./lifecycle-handler";
import {
  type LicenseKey,
  type LicenseKeyActivateInput,
  type LicenseKeyIssueInput,
  type LicenseKeyRevokeInput,
  type LicenseKeyValidateInput,
  type LicenseKeyValidation,
  licenseKeyActivateInputSchema,
  licenseKeyIssueInputSchema,
  licenseKeyRevokeInputSchema,
  licenseKeySchema,
  licenseKeyValidateInputSchema,
} from "./license-key-schema";
import { type LicenseKeyService, createLicenseKeyService } from "./license-key-service";
import type { LicenseKeyStore } from "./license-key-store";

export interface EntitlementsApi {
  grant(input: EntitlementGrant): Promise<EntitlementResult<EntitlementCheck>>;
  check(input: EntitlementCheckInput): Promise<EntitlementResult<EntitlementCheck>>;
  consume(input: EntitlementConsumeInput): Promise<EntitlementResult<EntitlementCheck>>;
  revoke(input: EntitlementRevokeInput): Promise<EntitlementResult<EntitlementCheck>>;
  benefits: {
    create(input: BenefitInput): Promise<EntitlementResult<Benefit>>;
    get(id: string): Promise<EntitlementResult<Benefit | null>>;
    listByProduct(productId: string): Promise<EntitlementResult<Benefit[]>>;
  };
  licenseKeys: {
    issue(input: LicenseKeyIssueInput): Promise<EntitlementResult<LicenseKey>>;
    validate(input: LicenseKeyValidateInput): Promise<EntitlementResult<LicenseKeyValidation>>;
    activate(input: LicenseKeyActivateInput): Promise<EntitlementResult<LicenseKey>>;
    revoke(input: LicenseKeyRevokeInput): Promise<EntitlementResult<LicenseKey>>;
  };
}

export interface EntitlementsPluginOptions {
  store?: EntitlementStore;
  benefitStore?: BenefitStore;
  licenseKeyStore?: LicenseKeyStore;
  initialGrants?: EntitlementGrant[];
  initialBenefits?: Benefit[];
  /**
   * Maps a subscription event payload to the benefits it should grant/revoke.
   * Defaults to looking benefits up by `metadata.productId` (or `priceId`).
   */
  resolveBenefits?: BenefitResolver;
  /** Resolves the customer a refund belongs to when not on the payload/metadata. */
  customerForRefund?: (refund: LifecycleRefund) => Promise<string | null>;
}

const invalidInput = <T>(): EntitlementResult<T> =>
  Result.err(
    new EntitlementError({
      error: entitlementErrors.INVALID_INPUT(),
      message: "Dados de entitlement inválidos.",
    }),
  );

const unsupportedRevoke = <T>(): EntitlementResult<T> =>
  Result.err(
    new EntitlementError({
      error: entitlementErrors.UNSUPPORTED_CAPABILITY(),
      message: "O armazenamento de entitlements configurado não suporta revogação.",
    }),
  );

export const entitlements = (
  options: EntitlementsPluginOptions = {},
): HyprPayPlugin<"entitlements", EntitlementsApi> => {
  const store = options.store ?? createInMemoryEntitlementStore(options.initialGrants ?? []);
  const benefitStore =
    options.benefitStore ?? createInMemoryBenefitStore(options.initialBenefits ?? []);
  const licenseKeyStore = options.licenseKeyStore ?? createInMemoryLicenseKeyStore();
  const licenseKeyService: LicenseKeyService = createLicenseKeyService(licenseKeyStore);
  const resolveBenefits = options.resolveBenefits ?? defaultBenefitResolver;

  const onEvent = createEntitlementsLifecycleHandler({
    store,
    benefits: benefitStore,
    licenseKeys: licenseKeyService,
    resolveBenefits,
    ...(options.customerForRefund === undefined
      ? {}
      : { customerForRefund: options.customerForRefund }),
  });

  return {
    id: "entitlements",
    namespace: "entitlements",
    hooks: { onEvent },
    extendApi: () => ({
      grant: async (input: EntitlementGrant) => {
        const parsed = entitlementGrantSchema.safeParse(input);
        return parsed.success ? await store.grant(parsed.data) : invalidInput();
      },
      check: async (input: EntitlementCheckInput) => {
        const parsed = entitlementCheckInputSchema.safeParse(input);
        return parsed.success ? await store.check(parsed.data) : invalidInput();
      },
      consume: async (input: EntitlementConsumeInput) => {
        const parsed = entitlementConsumeInputSchema.safeParse(input);
        return parsed.success ? await store.consume(parsed.data) : invalidInput();
      },
      revoke: async (input: EntitlementRevokeInput) => {
        const parsed = entitlementRevokeInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidInput();
        }

        if (store.revoke === undefined) {
          return unsupportedRevoke();
        }

        return store.revoke(parsed.data);
      },
      benefits: {
        create: async (input: BenefitInput) => {
          const parsed = benefitInputSchema.safeParse(input);

          if (!parsed.success) {
            return invalidInput<Benefit>();
          }

          return benefitStore.create({
            id: crypto.randomUUID(),
            ...parsed.data,
            createdAt: new Date().toISOString(),
          });
        },
        get: async (id: string) => {
          if (typeof id !== "string" || id.length === 0) {
            return invalidInput<Benefit | null>();
          }

          return benefitStore.findById(id);
        },
        listByProduct: async (productId: string) => {
          if (typeof productId !== "string" || productId.length === 0) {
            return invalidInput<Benefit[]>();
          }

          return benefitStore.listByProduct(productId);
        },
      },
      licenseKeys: {
        issue: async (input: LicenseKeyIssueInput) => licenseKeyService.issue(input),
        validate: async (input: LicenseKeyValidateInput) => licenseKeyService.validate(input),
        activate: async (input: LicenseKeyActivateInput) => licenseKeyService.activate(input),
        revoke: async (input: LicenseKeyRevokeInput) => licenseKeyService.revoke(input),
      },
    }),
  };
};

export type {
  Benefit,
  BenefitInput,
  BenefitResolver,
  BenefitStore,
  EntitlementCheck,
  EntitlementCheckInput,
  EntitlementConsumeInput,
  EntitlementGrant,
  EntitlementRevokeInput,
  EntitlementResult,
  EntitlementStore,
  LicenseKey,
  LicenseKeyActivateInput,
  LicenseKeyIssueInput,
  LicenseKeyRevokeInput,
  LicenseKeyService,
  LicenseKeyStore,
  LicenseKeyValidateInput,
  LicenseKeyValidation,
};
export {
  benefitInputSchema,
  benefitSchema,
  benefitTypeSchema,
  createInMemoryBenefitStore,
  createInMemoryEntitlementStore,
  createInMemoryLicenseKeyStore,
  createEntitlementsLifecycleHandler,
  createLicenseKeyService,
  defaultBenefitResolver,
  EntitlementError,
  entitlementCheckInputSchema,
  entitlementCheckSchema,
  entitlementConsumeInputSchema,
  entitlementErrors,
  entitlementGrantSchema,
  entitlementRevokeInputSchema,
  licenseKeyActivateInputSchema,
  licenseKeyIssueInputSchema,
  licenseKeyRevokeInputSchema,
  licenseKeySchema,
  licenseKeyValidateInputSchema,
};
