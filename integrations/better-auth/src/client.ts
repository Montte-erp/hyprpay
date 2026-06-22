import type { BetterAuthClientPlugin } from "better-auth/client";
import type { BetterFetchOption } from "@better-fetch/fetch";

export interface HyprPaySubscriptionUpgradeInput {
  readonly planId: string;
  readonly amount?: number;
  readonly successUrl?: string;
  readonly cancelUrl?: string;
}

export interface HyprPayBillingPortalInput {
  readonly returnUrl?: string;
}

export interface HyprPayBetterAuthClientOptions {
  readonly basePath?: string;
}

const defaultBasePath = "/hyprpay";

export const betterAuthHyprPayClient = (options: HyprPayBetterAuthClientOptions = {}): BetterAuthClientPlugin => {
  const basePath = options.basePath ?? defaultBasePath;

  return {
    id: "hyprpay-client",
    $InferServerPlugin: {},
    pathMethods: {
      [`${basePath}/customer/sync`]: "POST",
      [`${basePath}/subscription/upgrade`]: "POST",
      [`${basePath}/subscription/list`]: "GET",
      [`${basePath}/subscription/billing-portal`]: "POST",
    },
    getActions: $fetch => ({
      customer: {
        sync: async (fetchOptions?: BetterFetchOption) => $fetch(`${basePath}/customer/sync`, {
          method: "POST",
          ...fetchOptions,
        }),
      },
      subscription: {
        upgrade: async (input: HyprPaySubscriptionUpgradeInput, fetchOptions?: BetterFetchOption) =>
          $fetch(`${basePath}/subscription/upgrade`, {
            method: "POST",
            body: input,
            ...fetchOptions,
          }),
        list: async (fetchOptions?: BetterFetchOption) => $fetch(`${basePath}/subscription/list`, {
          method: "GET",
          ...fetchOptions,
        }),
        billingPortal: async (input: HyprPayBillingPortalInput = {}, fetchOptions?: BetterFetchOption) =>
          $fetch(`${basePath}/subscription/billing-portal`, {
            method: "POST",
            body: input,
            ...fetchOptions,
          }),
      },
    }),
  };
};
