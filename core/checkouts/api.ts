import { Effect } from "effect";
import { notFound } from "../errors";
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import { createCheckoutRecord, orderFromCheckout } from "../internal/records";
import { captureTelemetry } from "../internal/telemetry";
import { decodeCheckoutInput, type Checkout, type CheckoutInput } from "../schemas";
import type { BillingEffect } from "../store";

export const createCheckoutApi = (options: CreateHyprPayOptions) => ({
  create: (input: CheckoutInput): BillingEffect<Checkout> => Effect.gen(function* () {
    const parsed = yield* decodeCheckoutInput(input);
    const customer = yield* options.store.customers.findById(parsed.customerId);

    if (customer === null) {
      return yield* Effect.fail(notFound());
    }

    const draftCheckout = createCheckoutRecord(parsed);
    const providerMetadata = {
      ...(parsed.metadata ?? {}),
      hyprpayCheckoutId: draftCheckout.id,
    };
    const providerRef =
      options.provider?.capabilities.checkouts === true
        ? yield* options.provider.createCheckout({
            ...parsed,
            metadata: providerMetadata,
            customer,
          })
        : undefined;
    const checkout = yield* options.store.checkouts.create(
      providerRef === undefined
        ? draftCheckout
        : {
            ...draftCheckout,
            provider: providerRef.provider,
            providerCheckoutId: providerRef.providerCheckoutId,
            ...(providerRef.checkoutUrl === undefined ? {} : { checkoutUrl: providerRef.checkoutUrl }),
          },
    );
    yield* options.store.orders.create(orderFromCheckout(checkout));
    yield* captureTelemetry(options, "checkout.created", {
      amount: checkout.amount,
      currency: checkout.currency,
      provider: checkout.provider ?? "none",
      status: checkout.status,
    });

    return checkout;
  }),
  get: (checkoutId: string): BillingEffect<Checkout | null> => options.store.checkouts.findById(checkoutId),
});

export const checkoutsPlugin = defineHyprPayPlugin({
  id: "checkouts",
  build: createCheckoutApi,
});
