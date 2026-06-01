import { Result } from "better-result";
import type { BillingResult, PaymentProviderAdapter } from "./adapter";
import { createEntitlementStore } from "./entitlements";
import { BillingError, billingErrors } from "./errors";
import {
  type ChargeInput,
  type CheckoutInput,
  type CustomerInput,
  type EntitlementGrant,
  type SubscriptionInput,
  chargeInputSchema,
  checkoutInputSchema,
  customerInputSchema,
  subscriptionInputSchema,
} from "./schemas";

export interface HyprPayOptions {
  provider: PaymentProviderAdapter;
  entitlements?: EntitlementGrant[];
}

export const detectDocumentType = (document: string) => {
  if (document.length === 11) {
    return "cpf";
  }

  return "cnpj";
};

const invalidInput = <T>(): BillingResult<T> =>
  Result.err<T, BillingError>(
    new BillingError({
      error: billingErrors.INVALID_INPUT(),
      message: "Dados de billing inválidos.",
    }),
  );

export const createHyprPay = (options: HyprPayOptions) => {
  const entitlements = createEntitlementStore(options.entitlements);

  return {
    customers: {
      create: async (input: CustomerInput) => {
        const parsed = customerInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidInput();
        }

        return options.provider.createCustomer(parsed.data);
      },
    },
    checkout: {
      create: async (input: CheckoutInput) => {
        const parsed = checkoutInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidInput();
        }

        return options.provider.createCheckout(parsed.data);
      },
    },
    charges: {
      create: async (input: ChargeInput) => {
        const parsed = chargeInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidInput();
        }

        return options.provider.createCharge(parsed.data);
      },
    },
    subscriptions: {
      create: async (input: SubscriptionInput) => {
        const parsed = subscriptionInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidInput();
        }

        return options.provider.createSubscription(parsed.data);
      },
    },
    entitlements,
    webhooks: {
      handle: (request: Request) => options.provider.parseWebhook(request),
    },
  };
};

