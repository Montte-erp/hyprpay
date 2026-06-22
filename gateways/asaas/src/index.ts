import { Effect, Schema } from "effect";
import type { BillingEvent, CustomerInput } from "@hyprpay/core/schemas";
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
import type { RefundInput } from "@hyprpay/core/schemas";

export interface CreateAsaasProviderOptions {
  readonly apiKey: string;
  readonly server?: "sandbox" | "production";
  readonly baseUrl?: string;
  readonly userAgent?: string;
  readonly webhookToken?: string;
}

export interface AsaasCustomerRequest {
  readonly name: string;
  readonly email?: string;
  readonly cpfCnpj?: string;
  readonly externalReference?: string;
}

export interface AsaasPaymentRequest {
  readonly customer: string;
  readonly billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";
  readonly value: number;
  readonly dueDate: string;
  readonly description?: string;
  readonly externalReference?: string;
  readonly callback?: {
    readonly successUrl?: string;
    readonly autoRedirect?: boolean;
  };
}

export const asaasCapabilities = (options: CreateAsaasProviderOptions): ProviderCapabilities => ({
  customers: true,
  checkouts: true,
  subscriptions: false,
  refunds: false,
  webhooks: options.webhookToken !== undefined,
  benefits: false,
  entitlements: false,
  meters: false,
  licenseKeys: false,
  downloads: false,
  seats: false,
  customerPortal: false,
});

const optionalString = Schema.String.pipe(Schema.optionalKey);

const asaasCustomerSchema = Schema.Struct({
  id: Schema.NonEmptyString,
});

const asaasPaymentSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  invoiceUrl: optionalString,
  bankSlipUrl: optionalString,
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

const baseUrlFor = (options: CreateAsaasProviderOptions) => {
  if (options.baseUrl !== undefined) return options.baseUrl;
  if (options.server === "production") return "https://api.asaas.com/v3";

  return "https://api-sandbox.asaas.com/v3";
};

const jsonHeaders = (options: CreateAsaasProviderOptions): HeadersInit => ({
  accept: "application/json",
  "access_token": options.apiKey,
  "content-type": "application/json",
  "user-agent": options.userAgent ?? "HyprPay/0.0.0",
});

const readJson = (response: Response): Effect.Effect<unknown, HyprPayError> =>
  Effect.tryPromise({
    try: () => response.json(),
    catch: () => providerResponseInvalid("asaas"),
  });

const parseJsonText = (body: string): Effect.Effect<unknown, HyprPayError> =>
  Effect.tryPromise({
    try: () => Promise.resolve(JSON.parse(body)),
    catch: () => providerResponseInvalid("asaas"),
  });

const postJson = (
  options: CreateAsaasProviderOptions,
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
    catch: () => providerRequestFailed("asaas"),
  });

  if (!response.ok) {
    return yield* Effect.fail(providerRequestFailed("asaas", response.status));
  }

  return yield* readJson(response);
});

const today = () => new Date().toISOString().slice(0, 10);

const toAsaasBillingType = (methods: ProviderCheckoutInput["methods"]): AsaasPaymentRequest["billingType"] => {
  if (methods === undefined || methods.length !== 1) return "UNDEFINED";

  const method = methods[0];

  if (method === "pix") return "PIX";
  if (method === "boleto") return "BOLETO";
  if (method === "card") return "CREDIT_CARD";

  return "UNDEFINED";
};

const checkoutReference = (input: ProviderCheckoutInput): string | undefined =>
  metadataStringField(input, "hyprpayCheckoutId") ?? input.planId;

export const toAsaasCustomerRequest = (input: CustomerInput): AsaasCustomerRequest => ({
  name: input.name,
  ...(input.email === undefined ? {} : { email: input.email }),
  ...(input.document === undefined ? {} : { cpfCnpj: input.document }),
  ...(input.externalId === undefined ? {} : { externalReference: input.externalId }),
});

export const toAsaasPaymentRequest = (input: ProviderCheckoutInput): Effect.Effect<AsaasPaymentRequest, HyprPayError> => {
  const providerCustomerId = input.customer.providerCustomerId;

  if (providerCustomerId === undefined) return Effect.fail(invalidInput());

  const successUrl = input.successUrl;
  const reference = checkoutReference(input);

  return Effect.succeed({
    customer: providerCustomerId,
    billingType: toAsaasBillingType(input.methods),
    value: input.amount / 100,
    dueDate: today(),
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(reference === undefined ? {} : { externalReference: reference }),
    ...(successUrl === undefined
      ? {}
      : {
          callback: {
            successUrl,
            autoRedirect: true,
          },
        }),
  });
};

const createCustomer = (options: CreateAsaasProviderOptions) =>
  (input: CustomerInput): Effect.Effect<CustomerRef, HyprPayError> => Effect.gen(function* () {
    const response = yield* postJson(options, "/customers", toAsaasCustomerRequest(input));
    const parsed = yield* Schema.decodeUnknownEffect(asaasCustomerSchema)(response).pipe(
      Effect.mapError(() => providerResponseInvalid("asaas")),
    );

    return {
      provider: "asaas",
      providerCustomerId: parsed.id,
    };
  });

const createCheckout = (options: CreateAsaasProviderOptions) =>
  (input: ProviderCheckoutInput): Effect.Effect<CheckoutRef, HyprPayError> => Effect.gen(function* () {
    const request = yield* toAsaasPaymentRequest(input);
    const response = yield* postJson(options, "/payments", request);
    const parsed = yield* Schema.decodeUnknownEffect(asaasPaymentSchema)(response).pipe(
      Effect.mapError(() => providerResponseInvalid("asaas")),
    );

    return {
      provider: "asaas",
      providerCheckoutId: parsed.id,
      ...(parsed.invoiceUrl === undefined ? {} : { checkoutUrl: parsed.invoiceUrl }),
    };
  });

const unsupported = <TValue>(capability: string): Effect.Effect<TValue, HyprPayError> =>
  Effect.fail(capabilityUnsupported(capability));

const normalizedTypeFromAsaas = (event: string): BillingEvent["type"] => {
  if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") return "checkout.paid";
  if (event === "PAYMENT_OVERDUE") return "checkout.expired";
  if (event === "PAYMENT_DELETED" || event === "PAYMENT_BANK_SLIP_CANCELLED") return "checkout.canceled";

  return "unknown";
};

export const normalizeAsaasWebhookPayload = (payload: unknown): BillingEvent => {
  const event = stringField(payload, "event") ?? "unknown";
  const payment = field(payload, "payment");
  const value = numberField(payment, "value");
  const amount = value === undefined ? undefined : Math.round(value * 100);
  const checkoutId = stringField(payment, "externalReference");
  const providerOrderId = stringField(payment, "id");

  return {
    id: stringField(payload, "id") ?? `evt_${crypto.randomUUID()}`,
    processor: "asaas",
    type: normalizedTypeFromAsaas(event),
    occurredAt: new Date().toISOString(),
    payload,
    ...(checkoutId === undefined ? {} : { checkoutId }),
    ...(providerOrderId === undefined ? {} : { providerOrderId }),
    ...(amount === undefined ? {} : { amount }),
  };
};

const parseWebhook = (options: CreateAsaasProviderOptions) =>
  (input: WebhookRequest): Effect.Effect<BillingEvent, HyprPayError> => {
    if (options.webhookToken === undefined) return unsupported("webhooks");

    const webhookToken = options.webhookToken;

    return Effect.gen(function* () {
      if (input.request.headers.get("asaas-access-token") !== webhookToken) {
        return yield* Effect.fail(webhookVerificationFailed("asaas"));
      }

      const body = yield* Effect.tryPromise({
        try: () => input.request.text(),
        catch: () => providerResponseInvalid("asaas"),
      });
      const payload = yield* parseJsonText(body);
      const event = normalizeAsaasWebhookPayload(payload);

      return yield* Schema.decodeUnknownEffect(billingEventSchema)(event).pipe(
        Effect.mapError(() => providerResponseInvalid("asaas")),
      );
    });
  };

export const createAsaasProvider = (options: CreateAsaasProviderOptions): PaymentProviderAdapter => ({
  id: "asaas",
  capabilities: asaasCapabilities(options),
  createCustomer: createCustomer(options),
  createCheckout: createCheckout(options),
  createSubscription: (_input: ProviderSubscriptionInput) => unsupported("subscriptions"),
  refund: (_input: RefundInput): Effect.Effect<RefundRef, HyprPayError> => unsupported("refunds"),
  parseWebhook: parseWebhook(options),
});
