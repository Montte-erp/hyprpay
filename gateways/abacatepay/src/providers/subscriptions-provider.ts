import { Result } from "better-result";
import type {
  BillingResult,
  CancelSubscriptionInput,
  RecordUsageInput,
  Subscription,
  SubscriptionInput,
  UsageRecord,
} from "@hyprpay/subscriptions";
import type { z } from "zod";
import type { AbacatePayClient } from "../client/abacatepay-client";
import {
  abacatePayBillingResponseSchema,
  abacatePayEnvelopeSchema,
  abacatePaySubscriptionResponseSchema,
  abacatePayUsageRecordResponseSchema,
} from "../contracts/abacatepay-response-schema";
import { toSubscriptionStatus } from "../shared/status-mappers";

type SubscriptionProviderInput = SubscriptionInput & { providerProductId: string };
type AbacatePaySubscriptionCheckoutResponse = z.infer<typeof abacatePayBillingResponseSchema>;
type AbacatePaySubscriptionStateResponse = z.infer<typeof abacatePaySubscriptionResponseSchema>;

const toMethods = (paymentMethod: SubscriptionInput["paymentMethod"]) => {
  if (paymentMethod === "pix") {
    return ["PIX"];
  }

  if (paymentMethod === "boleto") {
    return ["BOLETO"];
  }

  return ["CARD"];
};

const toSubscriptionFromCheckout = (
  response: AbacatePaySubscriptionCheckoutResponse,
  input: SubscriptionProviderInput,
): Subscription => ({
  id: response.id,
  customerId: response.customerId ?? input.customerId,
  priceId: input.priceId,
  paymentMethod: input.paymentMethod,
  providerProductId: input.providerProductId,
  providerSubscriptionId: undefined,
  trialDays: input.trialDays,
  metadata: input.metadata ?? {},
  status: toSubscriptionStatus(response.status),
  currentPeriodStart: undefined,
  currentPeriodEnd: undefined,
  cancelAtPeriodEnd: false,
  canceledAt: undefined,
  endedAt: undefined,
  trialEndsAt: undefined,
  dunningRetryCount: 0,
});

const toSubscriptionFromState = (
  response: AbacatePaySubscriptionStateResponse,
): Subscription => ({
  id: response.id,
  customerId: response.customerId,
  priceId: "",
  paymentMethod: response.method === "PIX" ? "pix" : "card",
  providerProductId: undefined,
  providerSubscriptionId: response.id,
  trialDays: response.trialDays ?? undefined,
  metadata: {},
  status: toSubscriptionStatus(response.status),
  currentPeriodStart: response.createdAt,
  currentPeriodEnd: response.updatedAt,
  cancelAtPeriodEnd: false,
  canceledAt: response.canceledAt ?? undefined,
  endedAt: undefined,
  trialEndsAt: response.trialEndsAt ?? undefined,
  dunningRetryCount: 0,
});

export const createSubscription = async (
  client: AbacatePayClient,
  input: SubscriptionProviderInput,
): Promise<BillingResult<Subscription>> => {
  const result = await client.post(
    "subscriptions/create",
    {
      items: [{ id: input.providerProductId, quantity: 1 }],
      customerId: input.customerId,
      completionUrl: undefined,
      methods: toMethods(input.paymentMethod),
      metadata: input.metadata,
    },
    abacatePayEnvelopeSchema(abacatePayBillingResponseSchema),
  );

  if (Result.isError(result)) {
    return Result.err(result.error);
  }

  return Result.ok(toSubscriptionFromCheckout(result.value.data, input));
};

export const cancelSubscription = async (
  client: AbacatePayClient,
  input: CancelSubscriptionInput,
): Promise<BillingResult<Subscription>> => {
  const result = await client.post(
    "subscriptions/cancel",
    { id: input.subscriptionId },
    abacatePayEnvelopeSchema(abacatePaySubscriptionResponseSchema),
  );

  if (Result.isError(result)) {
    return Result.err(result.error);
  }

  return Result.ok(toSubscriptionFromState(result.value.data));
};

export const recordUsage = async (
  client: AbacatePayClient,
  input: RecordUsageInput,
): Promise<BillingResult<UsageRecord>> => {
  const result = await client.post(
    "subscriptions/record-usage",
    {
      id: input.subscriptionId,
      productId: input.productId,
      units: input.units,
      action: input.action,
    },
    abacatePayEnvelopeSchema(abacatePayUsageRecordResponseSchema),
  );

  if (Result.isError(result)) {
    return Result.err(result.error);
  }

  return Result.ok(result.value.data);
};
