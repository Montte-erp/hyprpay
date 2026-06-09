import { Result } from "better-result";
import type { CatalogProviderAdapter } from "@hyprpay/catalog";
import type { ChargesProviderAdapter } from "@hyprpay/charges";
import type { CheckoutsProviderAdapter } from "@hyprpay/checkouts";
import type { CustomersProviderAdapter } from "@hyprpay/customers";
import type { SubscriptionsProviderAdapter } from "@hyprpay/subscriptions";
import type { WebhooksProviderAdapter } from "@hyprpay/webhooks";
import { createAbacatePayClient, type AbacatePayClient } from "./client/abacatepay-client";
import {
  abacatePayAdapterOptionsSchema,
  type AbacatePayAdapterOptions,
} from "./abacatepay-env";
import { invalidAbacatePayConfig } from "./errors/abacatepay-errors";
import { createProduct } from "./providers/catalog-provider";
import { createCharge } from "./providers/charges-provider";
import { createCheckout } from "./providers/checkouts-provider";
import { createCustomer } from "./providers/customers-provider";
import {
  cancelSubscription,
  createSubscription,
  recordUsage,
} from "./providers/subscriptions-provider";
import { parseWebhook, verifyWebhook } from "./providers/webhooks-provider";

export interface AbacatePayGateway {
  catalog: CatalogProviderAdapter;
  customers: CustomersProviderAdapter;
  checkouts: CheckoutsProviderAdapter;
  charges: ChargesProviderAdapter;
  subscriptions: SubscriptionsProviderAdapter;
  webhooks: WebhooksProviderAdapter;
}

/**
 * Validates the adapter options once and builds the live HTTP client. The
 * `build` callback receives the ready client and assembles the gateway. When
 * the config is invalid (or the client cannot be built), every capability is
 * wired to return the shared {@link invalidAbacatePayConfig} error — replacing
 * the previous per-method invalid-config stubs with a single guard.
 */
const withClient = (
  input: AbacatePayAdapterOptions,
  build: (client: AbacatePayClient, options: AbacatePayAdapterOptions) => AbacatePayGateway,
): AbacatePayGateway => {
  const parsed = abacatePayAdapterOptionsSchema.safeParse(input);

  if (!parsed.success) {
    return invalidGateway();
  }

  const clientResult = createAbacatePayClient(parsed.data);

  if (Result.isError(clientResult)) {
    return invalidGateway();
  }

  return build(clientResult.value, parsed.data);
};

const invalidGateway = (): AbacatePayGateway => ({
  catalog: {
    id: "abacatepay",
    createProduct: async () => Result.err(invalidAbacatePayConfig()),
  },
  customers: {
    id: "abacatepay",
    createCustomer: async () => Result.err(invalidAbacatePayConfig()),
  },
  checkouts: {
    id: "abacatepay",
    createCheckout: async () => Result.err(invalidAbacatePayConfig()),
  },
  charges: {
    id: "abacatepay",
    createCharge: async () => Result.err(invalidAbacatePayConfig()),
  },
  subscriptions: {
    id: "abacatepay",
    createSubscription: async () => Result.err(invalidAbacatePayConfig()),
    cancelSubscription: async () => Result.err(invalidAbacatePayConfig()),
    recordUsage: async () => Result.err(invalidAbacatePayConfig()),
  },
  webhooks: {
    id: "abacatepay",
    verifyWebhook: async () => Result.err(invalidAbacatePayConfig()),
    parseWebhook: async () => Result.err(invalidAbacatePayConfig()),
  },
});

export const createAbacatePayGateway = (input: AbacatePayAdapterOptions): AbacatePayGateway =>
  withClient(input, (client, options) => ({
    catalog: {
      id: "abacatepay",
      createProduct: createProduct.bind(undefined, client),
    },
    customers: {
      id: "abacatepay",
      createCustomer: createCustomer.bind(undefined, client),
    },
    checkouts: {
      id: "abacatepay",
      createCheckout: createCheckout.bind(undefined, client),
    },
    charges: {
      id: "abacatepay",
      createCharge: createCharge.bind(undefined, client),
    },
    subscriptions: {
      id: "abacatepay",
      createSubscription: createSubscription.bind(undefined, client),
      cancelSubscription: cancelSubscription.bind(undefined, client),
      recordUsage: recordUsage.bind(undefined, client),
    },
    webhooks: {
      id: "abacatepay",
      verifyWebhook: (request: Request) => verifyWebhook(request, options.webhookSecret),
      parseWebhook,
    },
  }));

export const createAbacatePayAdapter = createAbacatePayGateway;

export { abacatePayAdapterOptionsSchema };
export type { AbacatePayAdapterOptions };
