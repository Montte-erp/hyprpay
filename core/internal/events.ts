import type { BillingEvent, BillingEventInput } from "../schemas";
import { id, now } from "./records";

export const eventFromInput = (input: BillingEventInput): BillingEvent => ({
  id: id("evt"),
  processor: input.processor,
  type: input.type,
  occurredAt: input.occurredAt ?? now(),
  ...(input.checkoutId === undefined ? {} : { checkoutId: input.checkoutId }),
  ...(input.customerId === undefined ? {} : { customerId: input.customerId }),
  ...(input.amount === undefined ? {} : { amount: input.amount }),
  ...(input.subscriptionId === undefined ? {} : { subscriptionId: input.subscriptionId }),
  ...(input.providerOrderId === undefined ? {} : { providerOrderId: input.providerOrderId }),
  ...(input.payload === undefined ? {} : { payload: input.payload }),
});
