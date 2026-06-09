import type { Charge } from "@hyprpay/charges";
import type { Checkout } from "@hyprpay/checkouts";
import type { ProviderProductInput } from "@hyprpay/catalog";
import type { Subscription } from "@hyprpay/subscriptions";
import type { z } from "zod";
import type {
  abacatePayBillingResponseSchema,
  abacatePaySubscriptionResponseSchema,
  abacatePayTransparentChargeResponseSchema,
} from "../contracts/abacatepay-response-schema";

type AbacatePayBillingStatus = z.infer<typeof abacatePayBillingResponseSchema>["status"];
type AbacatePaySubscriptionStatus = z.infer<typeof abacatePaySubscriptionResponseSchema>["status"];
type AbacatePayChargeStatus = z.infer<typeof abacatePayTransparentChargeResponseSchema>["status"];

/** Maps the AbacatePay billing/checkout status to the canonical checkout status. */
export const toCheckoutStatus = (status: AbacatePayBillingStatus): Checkout["status"] => {
  if (status === "PAID") {
    return "paid";
  }

  if (status === "EXPIRED") {
    return "expired";
  }

  if (status === "CANCELLED") {
    return "canceled";
  }

  if (status === "REFUNDED") {
    return "refunded";
  }

  return "pending";
};

/** Maps the AbacatePay transparent-charge status to the canonical charge status. */
export const toChargeStatus = (status: AbacatePayChargeStatus): Charge["status"] => {
  if (status === "PAID") {
    return "paid";
  }

  if (status === "EXPIRED") {
    return "expired";
  }

  if (status === "CANCELLED") {
    return "canceled";
  }

  if (status === "REFUNDED") {
    return "refunded";
  }

  return "pending";
};

/**
 * Maps both the subscription-state and the billing/checkout statuses to the
 * canonical subscription status (a subscription can be created via a checkout).
 */
export const toSubscriptionStatus = (
  status: AbacatePaySubscriptionStatus | AbacatePayBillingStatus,
): Subscription["status"] => {
  if (status === "ACTIVE" || status === "PAID") {
    return "active";
  }

  if (status === "FAILED") {
    return "failed";
  }

  if (status === "EXPIRED") {
    return "expired";
  }

  if (status === "CANCELLED") {
    return "canceled";
  }

  return "pending";
};

/** Maps the canonical billing interval to the AbacatePay product cycle. */
export const toCycle = (interval: ProviderProductInput["interval"]) => {
  if (interval === "week") {
    return "WEEKLY";
  }

  if (interval === "month") {
    return "MONTHLY";
  }

  if (interval === "quarter") {
    return "QUARTERLY";
  }

  if (interval === "half_year") {
    return "SEMIANNUALLY";
  }

  if (interval === "year") {
    return "ANNUALLY";
  }

  return undefined;
};
