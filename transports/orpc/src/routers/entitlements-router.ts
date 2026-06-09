import { z } from "zod";
import {
  benefitInputSchema,
  entitlementCheckInputSchema,
  entitlementConsumeInputSchema,
  entitlementGrantSchema,
  entitlementRevokeInputSchema,
  licenseKeyActivateInputSchema,
  licenseKeyIssueInputSchema,
  licenseKeyRevokeInputSchema,
  licenseKeyValidateInputSchema,
} from "@hyprpay/entitlements";
import { unwrap } from "../error/billing-result-to-orpc-error";
import { billingProcedure } from "../procedure";

const grant = billingProcedure
  .route({ method: "POST", path: "/billing/entitlements/grant" })
  .input(entitlementGrantSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.entitlements.grant(input)));

const check = billingProcedure
  .route({ method: "POST", path: "/billing/entitlements/check" })
  .input(entitlementCheckInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.entitlements.check(input)));

const consume = billingProcedure
  .route({ method: "POST", path: "/billing/entitlements/consume" })
  .input(entitlementConsumeInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.entitlements.consume(input)));

const revoke = billingProcedure
  .route({ method: "POST", path: "/billing/entitlements/revoke" })
  .input(entitlementRevokeInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.entitlements.revoke(input)));

const createBenefit = billingProcedure
  .route({ method: "POST", path: "/billing/entitlements/benefits" })
  .input(benefitInputSchema)
  .handler(async ({ context, input }) =>
    unwrap(await context.api.entitlements.benefits.create(input)),
  );

const getBenefit = billingProcedure
  .route({
    method: "GET",
    path: "/billing/entitlements/benefits/{id}",
    inputStructure: "detailed",
  })
  .input(z.object({ params: z.object({ id: z.string().min(1) }) }))
  .handler(async ({ context, input }) =>
    unwrap(await context.api.entitlements.benefits.get(input.params.id)),
  );

const listBenefitsByProduct = billingProcedure
  .route({
    method: "GET",
    path: "/billing/entitlements/benefits",
    inputStructure: "detailed",
  })
  .input(z.object({ query: z.object({ productId: z.string().min(1) }) }))
  .handler(async ({ context, input }) =>
    unwrap(await context.api.entitlements.benefits.listByProduct(input.query.productId)),
  );

const issueLicenseKey = billingProcedure
  .route({ method: "POST", path: "/billing/entitlements/license-keys" })
  .input(licenseKeyIssueInputSchema)
  .handler(async ({ context, input }) =>
    unwrap(await context.api.entitlements.licenseKeys.issue(input)),
  );

const validateLicenseKey = billingProcedure
  .route({ method: "POST", path: "/billing/entitlements/license-keys/validate" })
  .input(licenseKeyValidateInputSchema)
  .handler(async ({ context, input }) =>
    unwrap(await context.api.entitlements.licenseKeys.validate(input)),
  );

const activateLicenseKey = billingProcedure
  .route({ method: "POST", path: "/billing/entitlements/license-keys/activate" })
  .input(licenseKeyActivateInputSchema)
  .handler(async ({ context, input }) =>
    unwrap(await context.api.entitlements.licenseKeys.activate(input)),
  );

const revokeLicenseKey = billingProcedure
  .route({ method: "POST", path: "/billing/entitlements/license-keys/revoke" })
  .input(licenseKeyRevokeInputSchema)
  .handler(async ({ context, input }) =>
    unwrap(await context.api.entitlements.licenseKeys.revoke(input)),
  );

export const entitlementsRouter = {
  grant,
  check,
  consume,
  revoke,
  benefits: {
    create: createBenefit,
    get: getBenefit,
    listByProduct: listBenefitsByProduct,
  },
  licenseKeys: {
    issue: issueLicenseKey,
    validate: validateLicenseKey,
    activate: activateLicenseKey,
    revoke: revokeLicenseKey,
  },
};
