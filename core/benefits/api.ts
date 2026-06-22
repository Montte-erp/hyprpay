import { Effect } from "effect";
import { decodeBenefitGrantInput,
decodeBenefitRevokeInput,
type BenefitGrantInput,
type BenefitRevokeInput, } from "../benefits/schema"
import { notFound } from "../errors";
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import { createBenefitGrantRecord, now } from "../internal/records";
import type { BenefitGrant } from "../schemas";
import type { BillingEffect } from "../store";

export const createBenefitsApi = (options: CreateHyprPayOptions) => ({
  grant: (input: BenefitGrantInput): BillingEffect<BenefitGrant> => Effect.gen(function* () {
    const parsed = yield* decodeBenefitGrantInput(input);
    const customer = yield* options.store.customers.findById(parsed.customerId);

    if (customer === null) {
      return yield* Effect.fail(notFound());
    }

    return yield* options.store.benefitGrants.create(createBenefitGrantRecord(parsed));
  }),
  revoke: (input: BenefitRevokeInput): BillingEffect<BenefitGrant> => Effect.gen(function* () {
    const parsed = yield* decodeBenefitRevokeInput(input);
    const grant = yield* options.store.benefitGrants.findById(parsed.grantId);

    if (grant === null) {
      return yield* Effect.fail(notFound());
    }

    return yield* options.store.benefitGrants.update(parsed.grantId, {
      status: "revoked",
      updatedAt: now(),
    });
  }),
  list: (filter?: Partial<BenefitGrant>): BillingEffect<readonly BenefitGrant[]> =>
    options.store.benefitGrants.list(filter),
});

export const benefitsPlugin = defineHyprPayPlugin({
  id: "benefits",
  build: createBenefitsApi,
});
