import { Effect, Schema } from "effect";
import type { BillingEvent, CustomerInput, RefundInput } from "@hyprpay/core/schemas";
import { billingEventSchema } from "@hyprpay/core/schemas";
import {
  capabilityUnsupported,
  invalidInput,
  providerRequestFailed,
  providerResponseInvalid,
  webhookVerificationFailed,
  type HyprPayError,
} from "@hyprpay/core/errors";
import type {
  CheckoutRef,
  CustomerRef,
  PaymentProviderAdapter,
  ProviderCapabilities,
  ProviderCheckoutInput,
  ProviderSubscriptionInput,
  RefundRef,
  WebhookRequest,
} from "@hyprpay/core/adapter";

export interface CreateAbacatePayProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly webhookSecret?: string;
  readonly webhookSignatureKey?: string;
}

export interface AbacatePayBillingProductRequest {
  readonly externalId: string;
  readonly name: string;
  readonly description?: string;
  readonly quantity: number;
  readonly price: number;
}

export interface AbacatePayBillingRequest {
  readonly frequency: "ONE_TIME";
  readonly methods: readonly ("PIX" | "CARD")[];
  readonly products: readonly AbacatePayBillingProductRequest[];
  readonly returnUrl: string;
  readonly completionUrl: string;
  readonly externalId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const abacatePayCapabilities = (options: CreateAbacatePayProviderOptions): ProviderCapabilities => ({
  customers: false,
  checkouts: true,
  subscriptions: false,
  refunds: false,
  webhooks: options.webhookSecret !== undefined || options.webhookSignatureKey !== undefined,
  benefits: false,
  entitlements: false,
  meters: false,
  licenseKeys: false,
  downloads: false,
  seats: false,
  customerPortal: false,
});

const optionalString = Schema.String.pipe(Schema.optionalKey);

const abacateBillingResponseSchema = Schema.Struct({
  data: Schema.Struct({
    id: Schema.NonEmptyString,
    url: optionalString,
  }),
});

const field = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;

  return Reflect.get(value, key);
};

const stringField = (value: unknown, key: string): string | undefined => {
  const result = field(value, key);

  if (typeof result !== "string" || result.length === 0) return undefined;

  return result;
};

const numberField = (value: unknown, key: string): number | undefined => {
  const result = field(value, key);

  if (typeof result !== "number") return undefined;

  return result;
};

const metadataStringField = (value: unknown, key: string): string | undefined => stringField(field(value, "metadata"), key);

const baseUrlFor = (options: CreateAbacatePayProviderOptions) => options.baseUrl ?? "https://api.abacatepay.com/v1";

const jsonHeaders = (options: CreateAbacatePayProviderOptions): HeadersInit => ({
  authorization: `Bearer ${options.apiKey}`,
  accept: "application/json",
  "content-type": "application/json",
});

const readJson = (response: Response): Effect.Effect<unknown, HyprPayError> =>
  Effect.tryPromise({
    try: () => response.json(),
    catch: () => providerResponseInvalid("abacate-pay"),
  });

const parseJsonText = (body: string): Effect.Effect<unknown, HyprPayError> =>
  Effect.tryPromise({
    try: () => Promise.resolve(JSON.parse(body)),
    catch: () => providerResponseInvalid("abacate-pay"),
  });

const postJson = (
  options: CreateAbacatePayProviderOptions,
  path: string,
  body: unknown,
): Effect.Effect<unknown, HyprPayError> => Effect.gen(function* () {
  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(`${baseUrlFor(options)}${path}`, {
        method: "POST",
        headers: jsonHeaders(options),
        body: JSON.stringify(body),
      }),
    catch: () => providerRequestFailed("abacate-pay"),
  });

  if (!response.ok) {
    return yield* Effect.fail(providerRequestFailed("abacate-pay", response.status));
  }

  return yield* readJson(response);
});

const checkoutReference = (input: ProviderCheckoutInput): string | undefined =>
  metadataStringField(input, "hyprpayCheckoutId") ?? input.planId;

const toAbacatePayMethods = (
  methods: ProviderCheckoutInput["methods"],
): Effect.Effect<readonly ("PIX" | "CARD")[], HyprPayError> => {
  if (methods === undefined || methods.length === 0) return Effect.succeed(["PIX"]);

  const mapped: ("PIX" | "CARD")[] = [];

  for (const method of methods) {
    if (method === "pix") mapped.push("PIX");
    if (method === "card") mapped.push("CARD");
    if (method === "boleto") return Effect.fail(invalidInput());
  }

  return Effect.succeed(mapped);
};

const plainMetadata = (metadata: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> | undefined => {
  if (metadata === undefined) return undefined;
  if (Object.keys(metadata).length === 0) return undefined;

  return metadata;
};

export const toAbacatePayBillingRequest = (
  input: ProviderCheckoutInput,
): Effect.Effect<AbacatePayBillingRequest, HyprPayError> => Effect.gen(function* () {
  if (input.successUrl === undefined || input.cancelUrl === undefined) {
    return yield* Effect.fail(invalidInput());
  }

  const methods = yield* toAbacatePayMethods(input.methods);
  const externalId = checkoutReference(input);
  const productName = input.description ?? input.planId ?? "HyprPay checkout";

  return {
    frequency: "ONE_TIME",
    methods,
    products: [
      {
        externalId: input.planId ?? externalId ?? "hyprpay-checkout",
        name: productName,
        ...(input.description === undefined ? {} : { description: input.description }),
        quantity: 1,
        price: input.amount,
      },
    ],
    returnUrl: input.cancelUrl,
    completionUrl: input.successUrl,
    ...(externalId === undefined ? {} : { externalId }),
    ...(plainMetadata(input.metadata) === undefined ? {} : { metadata: input.metadata }),
  };
});

const unsupported = <TValue>(capability: string): Effect.Effect<TValue, HyprPayError> =>
  Effect.fail(capabilityUnsupported(capability));

const createCheckout = (options: CreateAbacatePayProviderOptions) =>
  (input: ProviderCheckoutInput): Effect.Effect<CheckoutRef, HyprPayError> => Effect.gen(function* () {
    const request = yield* toAbacatePayBillingRequest(input);
    const response = yield* postJson(options, "/billing/create", request);
    const parsed = yield* Schema.decodeUnknownEffect(abacateBillingResponseSchema)(response).pipe(
      Effect.mapError(() => providerResponseInvalid("abacate-pay")),
    );

    return {
      provider: "abacate-pay",
      providerCheckoutId: parsed.data.id,
      ...(parsed.data.url === undefined ? {} : { checkoutUrl: parsed.data.url }),
    };
  });

const normalizedTypeFromAbacatePay = (event: string): BillingEvent["type"] => {
  if (event === "billing.paid" || event === "checkout.completed" || event === "transparent.completed") return "checkout.paid";
  if (event === "subscription.completed" || event === "subscription.renewed") return "subscription.active";
  if (event === "subscription.cancelled") return "subscription.canceled";

  return "unknown";
};

const checkoutDataFromPayload = (payload: unknown): unknown => {
  const data = field(payload, "data");
  const checkout = field(data, "checkout");

  return checkout ?? data;
};

export const normalizeAbacatePayWebhookPayload = (payload: unknown): BillingEvent => {
  const event = stringField(payload, "event") ?? "unknown";
  const data = checkoutDataFromPayload(payload);
  const checkoutId = stringField(data, "externalId") ?? metadataStringField(data, "hyprpayCheckoutId");
  const providerOrderId = stringField(data, "id");
  const amount = numberField(data, "amount") ?? numberField(data, "paidAmount");
  const subscriptionId = metadataStringField(data, "hyprpaySubscriptionId");

  return {
    id: stringField(payload, "id") ?? `evt_${crypto.randomUUID()}`,
    processor: "abacate-pay",
    type: normalizedTypeFromAbacatePay(event),
    occurredAt: stringField(data, "updatedAt") ?? new Date().toISOString(),
    payload,
    ...(checkoutId === undefined ? {} : { checkoutId }),
    ...(providerOrderId === undefined ? {} : { providerOrderId }),
    ...(subscriptionId === undefined ? {} : { subscriptionId }),
    ...(amount === undefined ? {} : { amount }),
  };
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
};

const constantTimeEquals = (left: string, right: string) => {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    const leftCode = left.charCodeAt(index) || 0;
    const rightCode = right.charCodeAt(index) || 0;
    diff |= leftCode ^ rightCode;
  }

  return diff === 0;
};

const hmacSha256Base64 = (secret: string, body: string): Effect.Effect<string, HyprPayError> =>
  Effect.tryPromise({
    try: async () => {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));

      return bytesToBase64(new Uint8Array(signature));
    },
    catch: () => webhookVerificationFailed("abacate-pay"),
  });

const verifySignature = (
  input: WebhookRequest,
  body: string,
  signatureKey: string | undefined,
): Effect.Effect<void, HyprPayError> => {
  if (signatureKey === undefined) return Effect.void;

  const signature = input.request.headers.get("x-webhook-signature");

  if (signature === null) return Effect.fail(webhookVerificationFailed("abacate-pay"));

  return Effect.gen(function* () {
    const expected = yield* hmacSha256Base64(signatureKey, body);

    if (!constantTimeEquals(expected, signature)) {
      return yield* Effect.fail(webhookVerificationFailed("abacate-pay"));
    }
  });
};

const verifyUrlSecret = (
  input: WebhookRequest,
  webhookSecret: string | undefined,
): Effect.Effect<void, HyprPayError> => {
  if (webhookSecret === undefined) return Effect.void;

  const url = new URL(input.request.url);

  if (url.searchParams.get("webhookSecret") !== webhookSecret) {
    return Effect.fail(webhookVerificationFailed("abacate-pay"));
  }

  return Effect.void;
};

const parseWebhook = (options: CreateAbacatePayProviderOptions) =>
  (input: WebhookRequest): Effect.Effect<BillingEvent, HyprPayError> => {
    if (options.webhookSecret === undefined && options.webhookSignatureKey === undefined) return unsupported("webhooks");

    return Effect.gen(function* () {
      yield* verifyUrlSecret(input, options.webhookSecret);
      const body = yield* Effect.tryPromise({
        try: () => input.request.text(),
        catch: () => providerResponseInvalid("abacate-pay"),
      });
      yield* verifySignature(input, body, options.webhookSignatureKey);
      const payload = yield* parseJsonText(body);
      const event = normalizeAbacatePayWebhookPayload(payload);

      return yield* Schema.decodeUnknownEffect(billingEventSchema)(event).pipe(
        Effect.mapError(() => providerResponseInvalid("abacate-pay")),
      );
    });
  };

export const createAbacatePayProvider = (options: CreateAbacatePayProviderOptions): PaymentProviderAdapter => ({
  id: "abacate-pay",
  capabilities: abacatePayCapabilities(options),
  createCustomer: (_input: CustomerInput): Effect.Effect<CustomerRef, HyprPayError> => unsupported("customers"),
  createCheckout: createCheckout(options),
  createSubscription: (_input: ProviderSubscriptionInput) => unsupported("subscriptions"),
  refund: (_input: RefundInput): Effect.Effect<RefundRef, HyprPayError> => unsupported("refunds"),
  parseWebhook: parseWebhook(options),
});
