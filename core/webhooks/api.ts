import { Effect } from "effect";
import { capabilityUnsupported } from "../errors";
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import { grantPlanBenefits, revokeSourceBenefits } from "../benefits/grants";
import { eventFromInput } from "../internal/events";
import { captureTelemetry } from "../internal/telemetry";
import { now } from "../internal/records";
import { decodeBillingEventInput, type BillingEvent, type BillingEventInput, type Subscription } from "../schemas";
import type { BillingEffect } from "../store";
import type { WebhookRequest } from "../adapter";

const markCheckoutPaid = (options: CreateHyprPayOptions, event: BillingEvent): BillingEffect<BillingEvent> =>
  Effect.gen(function* () {
    const checkoutId = event.checkoutId;

    if (checkoutId === undefined) {
      return event;
    }

    const checkout = yield* options.store.checkouts.findById(checkoutId);

    if (checkout === null) {
      return event;
    }

    const timestamp = now();
    yield* options.store.checkouts.update(checkoutId, {
      status: "paid",
      updatedAt: timestamp,
    });

    const orders = yield* options.store.orders.list({ checkoutId });
    const order = orders[0];

    if (order !== undefined) {
      yield* options.store.orders.update(order.id, {
        status: "paid",
        paidAt: event.occurredAt,
        updatedAt: timestamp,
        provider: event.processor,
        ...(event.providerOrderId === undefined ? {} : { providerOrderId: event.providerOrderId }),
      });
    }

    if (checkout.planId !== undefined) {
      yield* grantPlanBenefits(options, checkout.customerId, checkout.planId, checkout.id);
    }

    return event;
  });

const subscriptionStatusFromEvent = (eventType: BillingEvent["type"]): Subscription["status"] | null => {
  if (eventType === "subscription.created") return "pending";
  if (eventType === "subscription.active") return "active";
  if (eventType === "subscription.past_due") return "past_due";
  if (eventType === "subscription.canceled") return "canceled";

  return null;
};

const markSubscriptionStatus = (options: CreateHyprPayOptions, event: BillingEvent): BillingEffect<BillingEvent> =>
  Effect.gen(function* () {
    const subscriptionId = event.subscriptionId;
    const status = subscriptionStatusFromEvent(event.type);

    if (subscriptionId === undefined || status === null) {
      return event;
    }

    const subscription = yield* options.store.subscriptions.findById(subscriptionId);

    if (subscription === null) {
      return event;
    }

    const updated = yield* options.store.subscriptions.update(subscriptionId, {
      status,
      updatedAt: now(),
    });

    if (status === "active") {
      yield* grantPlanBenefits(options, updated.customerId, updated.planId, updated.id);
    }

    if (status === "canceled") {
      yield* revokeSourceBenefits(options, updated.id);
    }

    return event;
  });

const emitEvent = (options: CreateHyprPayOptions, event: BillingEvent): BillingEffect<void> => {
  if (options.events === undefined) {
    return Effect.succeed(undefined);
  }

  return options.events.emit(event);
};

export const commitBillingEvent = (options: CreateHyprPayOptions, event: BillingEvent): BillingEffect<BillingEvent> =>
  Effect.gen(function* () {
    const normalizedEvent = yield* options.store.events.create(event);

    if (normalizedEvent.type === "checkout.paid") {
      yield* markCheckoutPaid(options, normalizedEvent);
    }

    yield* markSubscriptionStatus(options, normalizedEvent);
    yield* emitEvent(options, normalizedEvent);
    yield* captureTelemetry(options, "webhook.committed", {
      processor: normalizedEvent.processor,
      type: normalizedEvent.type,
    });

    return normalizedEvent;
  });

export const createWebhooksApi = (options: CreateHyprPayOptions) => ({
  handle: (input: BillingEventInput): BillingEffect<BillingEvent> => Effect.gen(function* () {
    const parsed = yield* decodeBillingEventInput(input);
    return yield* commitBillingEvent(options, eventFromInput(parsed));
  }),
  receive: (input: WebhookRequest): BillingEffect<BillingEvent> => Effect.gen(function* () {
    const provider = options.provider;

    if (provider === undefined || provider.capabilities.webhooks === false) {
      return yield* Effect.fail(capabilityUnsupported("webhooks"));
    }

    const normalizedEvent = yield* provider.parseWebhook(input);
    return yield* commitBillingEvent(options, normalizedEvent);
  }),
});

export const webhooksPlugin = defineHyprPayPlugin({
  id: "webhooks",
  build: createWebhooksApi,
});
