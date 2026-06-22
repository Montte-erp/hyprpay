import { Effect } from "effect";
import { notFound } from "../errors";
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import { grantPlanBenefits } from "../benefits/grants";
import { createSubscriptionRecord } from "../internal/records";
import { captureTelemetry } from "../internal/telemetry";
import { decodeSubscriptionInput, type Subscription, type SubscriptionInput } from "../schemas";
import type { BillingEffect } from "../store";

export const createSubscriptionsApi = (options: CreateHyprPayOptions) => ({
  create: (input: SubscriptionInput): BillingEffect<Subscription> => Effect.gen(function* () {
    const parsed = yield* decodeSubscriptionInput(input);
    const customer = yield* options.store.customers.findById(parsed.customerId);

    if (customer === null) {
      return yield* Effect.fail(notFound());
    }

    const draftSubscription = createSubscriptionRecord(parsed);
    const providerMetadata = {
      ...(parsed.metadata ?? {}),
      hyprpaySubscriptionId: draftSubscription.id,
    };
    const providerRef =
      options.provider?.capabilities.subscriptions === true
        ? yield* options.provider.createSubscription({
            ...parsed,
            metadata: providerMetadata,
            customer,
          })
        : undefined;
    const subscription = yield* options.store.subscriptions.create(
      providerRef === undefined
        ? draftSubscription
        : {
            ...draftSubscription,
            provider: providerRef.provider,
            providerSubscriptionId: providerRef.providerSubscriptionId,
            status: providerRef.status,
            ...(providerRef.checkoutUrl === undefined ? {} : { checkoutUrl: providerRef.checkoutUrl }),
          },
    );

    if (subscription.status === "active") {
      yield* grantPlanBenefits(options, subscription.customerId, subscription.planId, subscription.id);
    }
    yield* captureTelemetry(options, "subscription.created", {
      provider: subscription.provider ?? "none",
      status: subscription.status,
    });

    return subscription;
  }),
  get: (subscriptionId: string): BillingEffect<Subscription | null> =>
    options.store.subscriptions.findById(subscriptionId),
  list: (filter?: Partial<Subscription>): BillingEffect<readonly Subscription[]> =>
    options.store.subscriptions.list(filter),
});

export const subscriptionsPlugin = defineHyprPayPlugin({
  id: "subscriptions",
  build: createSubscriptionsApi,
});
