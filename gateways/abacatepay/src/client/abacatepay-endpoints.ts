import type { AbacatePayAdapterOptions } from "../abacatepay-env";

/**
 * AbacatePay REST base URLs keyed by environment.
 *
 * Production is the documented v2 host. AbacatePay does not publish a distinct
 * sandbox host today, so sandbox traffic targets the same base URL — test mode
 * is selected through the (test) API key rather than the host.
 *
 * TODO: switch `sandbox` to a dedicated host if AbacatePay ever ships one.
 */
export const ABACATEPAY_BASE_URLS = {
  production: "https://api.abacatepay.com/v2",
  sandbox: "https://api.abacatepay.com/v2",
} as const satisfies Record<AbacatePayAdapterOptions["environment"], string>;

export const resolveAbacatePayBaseUrl = (
  environment: AbacatePayAdapterOptions["environment"],
): string => ABACATEPAY_BASE_URLS[environment];
