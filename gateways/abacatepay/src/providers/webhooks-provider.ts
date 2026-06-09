import { createHmac, timingSafeEqual } from "node:crypto";
import { Result } from "better-result";
import type { BillingEvent, BillingResult } from "@hyprpay/webhooks";
import type { z } from "zod";
import { ABACATEPAY_PUBLIC_WEBHOOK_KEY } from "../abacatepay-env";
import { abacatePayWebhookSchema } from "../contracts/abacatepay-response-schema";
import {
  abacatePayResponseError,
  abacatePayWebhookSignatureError,
} from "../errors/abacatepay-errors";

type AbacatePayWebhookPayload = z.infer<typeof abacatePayWebhookSchema>;

const equalSignatures = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

/**
 * Verifies an AbacatePay webhook.
 *
 * PRIMARY: HMAC-SHA256 over the raw request body, compared against the
 * `X-Webhook-Signature` header using the shared public key. This is the real
 * authenticity check.
 *
 * SECONDARY (weak): when a `webhookSecret` is configured, the `webhookSecret`
 * query-string parameter must also match. This is a defence-in-depth gate only
 * — it travels in the URL and must NOT be treated as the primary check.
 */
export const verifyWebhook = async (
  request: Request,
  webhookSecret?: string,
): Promise<BillingResult<void>> => {
  if (webhookSecret !== undefined) {
    const url = new URL(request.url);
    const secretFromUrl = url.searchParams.get("webhookSecret");

    if (secretFromUrl !== webhookSecret) {
      return Result.err(abacatePayWebhookSignatureError());
    }
  }

  const signature = request.headers.get("X-Webhook-Signature");

  if (signature === null) {
    return Result.err(abacatePayWebhookSignatureError());
  }

  const rawBodyResult = await Result.tryPromise({
    try: () => request.text(),
    catch: () => abacatePayWebhookSignatureError(),
  });

  if (Result.isError(rawBodyResult)) {
    return Result.err(rawBodyResult.error);
  }

  const expected = createHmac("sha256", ABACATEPAY_PUBLIC_WEBHOOK_KEY)
    .update(Buffer.from(rawBodyResult.value, "utf8"))
    .digest("base64");

  if (!equalSignatures(expected, signature)) {
    return Result.err(abacatePayWebhookSignatureError());
  }

  return Result.ok(undefined);
};

const readStringProperty = (value: unknown, key: string) => {
  if (value !== null && typeof value === "object") {
    const candidate = Reflect.get(value, key);

    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return undefined;
};

const readUnknownProperty = (value: unknown, key: string) => {
  if (value !== null && typeof value === "object") {
    return Reflect.get(value, key);
  }

  return undefined;
};

const toBillingEventType = (event: string): BillingEvent["type"] => {
  if (event === "checkout.completed") {
    return "checkout.completed";
  }

  if (event === "checkout.disputed") {
    return "checkout.disputed";
  }

  if (event === "checkout.refunded") {
    return "checkout.refunded";
  }

  if (event === "subscription.trial_started") {
    return "subscription.trial_started";
  }

  if (event === "subscription.completed") {
    return "subscription.completed";
  }

  if (event === "subscription.renewed") {
    return "invoice.paid";
  }

  if (event === "subscription.canceled") {
    return "subscription.canceled";
  }

  if (event === "subscription.late") {
    return "subscription.past_due";
  }

  return "payment.pending";
};

const toBillingEvent = (payload: AbacatePayWebhookPayload): BillingEvent => {
  const checkout = readUnknownProperty(payload.data, "checkout");
  const payment = readUnknownProperty(payload.data, "payment");
  const subscription = readUnknownProperty(payload.data, "subscription");
  const customer = readUnknownProperty(payload.data, "customer");

  return {
    id:
      readStringProperty(payload, "id") ??
      readStringProperty(checkout, "id") ??
      readStringProperty(payment, "id") ??
      readStringProperty(subscription, "id") ??
      payload.event,
    externalId:
      readStringProperty(checkout, "externalId") ??
      readStringProperty(payment, "externalId") ??
      readStringProperty(payload, "id"),
    type: toBillingEventType(payload.event),
    provider: "abacatepay",
    customerId: readStringProperty(customer, "id") ?? readStringProperty(checkout, "customerId"),
    chargeId: readStringProperty(payment, "id") ?? readStringProperty(checkout, "id"),
    subscriptionId: readStringProperty(subscription, "id"),
    occurredAt:
      readStringProperty(payload, "createdAt") ??
      readStringProperty(subscription, "updatedAt") ??
      readStringProperty(payment, "updatedAt") ??
      readStringProperty(checkout, "updatedAt") ??
      new Date().toISOString(),
    payload,
  };
};

export const parseWebhook = async (request: Request): Promise<BillingResult<BillingEvent>> => {
  const jsonResult = await Result.tryPromise({
    try: () => request.json(),
    catch: () => abacatePayResponseError("Webhook da AbacatePay não é JSON válido."),
  });

  if (Result.isError(jsonResult)) {
    return Result.err(jsonResult.error);
  }

  const parsed = abacatePayWebhookSchema.safeParse(jsonResult.value);

  if (!parsed.success) {
    return Result.err(
      abacatePayResponseError("Webhook da AbacatePay não respeita o contrato mínimo."),
    );
  }

  return Result.ok(toBillingEvent(parsed.data));
};
