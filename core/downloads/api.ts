import { Effect } from "effect";
import { decodeDownloadAccessInput,
type DownloadAccessInput,
type DownloadAccessResult, } from "../downloads/schema"
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import { findBenefit } from "../internal/catalog";
import type { BillingEffect } from "../store";

export const createDownloadsApi = (options: CreateHyprPayOptions) => ({
  getAccess: (input: DownloadAccessInput): BillingEffect<DownloadAccessResult> => Effect.gen(function* () {
    const parsed = yield* decodeDownloadAccessInput(input);
    const grants = yield* options.store.benefitGrants.list({
      customerId: parsed.customerId,
      benefitId: parsed.benefitId,
      status: "active",
    });

    if (grants.length === 0) {
      return {
        allowed: false,
        benefitId: parsed.benefitId,
        reason: "benefit_not_granted",
      };
    }

    const grantBenefit = findBenefit(options.catalog ?? [], parsed.benefitId);

    if (grantBenefit?.type !== "file_download") {
      return {
        allowed: false,
        benefitId: parsed.benefitId,
        reason: "benefit_not_downloadable",
      };
    }

    return {
      allowed: true,
      benefitId: parsed.benefitId,
      fileId: grantBenefit.fileId,
      ...(grantBenefit.url === undefined ? {} : { url: grantBenefit.url }),
    };
  }),
});

export const downloadsPlugin = defineHyprPayPlugin({
  id: "downloads",
  build: createDownloadsApi,
});
