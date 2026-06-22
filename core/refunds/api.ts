import { Effect } from "effect";
import { capabilityUnsupported, notFound } from "../errors";
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import { createRefundRecord, now } from "../internal/records";
import { decodeRefundInput, type Refund, type RefundInput } from "../schemas";
import type { BillingEffect } from "../store";

export const createRefundsApi = (options: CreateHyprPayOptions) => ({
  create: (input: RefundInput): BillingEffect<Refund> => Effect.gen(function* () {
    const parsed = yield* decodeRefundInput(input);
    const provider = options.provider;

    if (provider === undefined || provider.capabilities.refunds === false) {
      return yield* Effect.fail(capabilityUnsupported("refunds"));
    }

    const order = yield* options.store.orders.findById(parsed.orderId);

    if (order === null) {
      return yield* Effect.fail(notFound());
    }

    const providerOrderId = parsed.providerOrderId ?? order.providerOrderId;

    if (providerOrderId === undefined) {
      return yield* Effect.fail(notFound());
    }

    const refundInput = {
      ...parsed,
      providerOrderId,
      amount: parsed.amount ?? order.amount,
    };
    const providerRef = yield* provider.refund(refundInput);
    const refund = yield* options.store.refunds.create(createRefundRecord(refundInput, providerRef));

    if (providerRef.status === "succeeded") {
      yield* options.store.orders.update(order.id, {
        status: "refunded",
        updatedAt: now(),
      });
    }

    return refund;
  }),
  get: (refundId: string): BillingEffect<Refund | null> => options.store.refunds.findById(refundId),
  list: (filter?: Partial<Refund>): BillingEffect<readonly Refund[]> => options.store.refunds.list(filter),
});

export const refundsPlugin = defineHyprPayPlugin({
  id: "refunds",
  build: createRefundsApi,
});
