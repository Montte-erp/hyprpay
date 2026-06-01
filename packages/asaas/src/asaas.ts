import { Result } from "better-result";
import { defineErrorCatalog } from "evlog";
import { z } from "zod";
import {
  BillingError,
  billingErrors,
} from "@hyprpay/core/errors";
import type { BillingResult, PaymentProviderAdapter } from "@hyprpay/core/adapter";
import {
  type BillingEvent,
  type Charge,
  type ChargeInput,
  type Checkout,
  type CheckoutInput,
  type Customer,
  type CustomerInput,
  type Subscription,
  type SubscriptionInput,
} from "@hyprpay/core/schemas";
import { detectDocumentType } from "@hyprpay/core";

const asaasErrors = defineErrorCatalog("hyprpay.asaas", {
  INVALID_CONFIG: {
    status: 400,
    message: "Configuração do Asaas inválida.",
    tags: ["hyprpay", "asaas"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "hyprpay.asaas": typeof asaasErrors;
  }
}

export const asaasEnvironmentSchema = z.enum(["sandbox", "production"]);

export const asaasAdapterOptionsSchema = z.object({
  apiKey: z.string().min(1),
  environment: asaasEnvironmentSchema.default("sandbox"),
});

export type AsaasAdapterOptions = z.infer<typeof asaasAdapterOptionsSchema>;

const asaasCustomerResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
  cpfCnpj: z.string().optional(),
  phone: z.string().optional(),
});

const asaasPaymentResponseSchema = z.object({
  id: z.string().min(1),
  customer: z.string().min(1),
  value: z.number(),
  billingType: z.string().min(1),
  status: z.string().min(1),
  description: z.string().optional(),
  invoiceUrl: z.string().url().optional(),
  bankSlipUrl: z.string().url().optional(),
  dueDate: z.string().optional(),
});

const asaasSubscriptionResponseSchema = z.object({
  id: z.string().min(1),
  customer: z.string().min(1),
  billingType: z.string().min(1),
  status: z.string().min(1),
  value: z.number(),
  nextDueDate: z.string().optional(),
});

const asaasWebhookSchema = z.object({
  event: z.string().min(1),
  payment: asaasPaymentResponseSchema.optional(),
  subscription: asaasSubscriptionResponseSchema.optional(),
});

const baseUrlByEnvironment = (environment: z.infer<typeof asaasEnvironmentSchema>) => {
  if (environment === "production") {
    return "https://api.asaas.com/v3";
  }

  return "https://sandbox.asaas.com/api/v3";
};

const toMajorUnits = (amountInCents: number) => amountInCents / 100;

const toPaymentMethod = (method: ChargeInput["method"]) => {
  if (method === "pix") {
    return "PIX";
  }

  if (method === "boleto") {
    return "BOLETO";
  }

  return "CREDIT_CARD";
};

const toChargeStatus = (status: string): Charge["status"] => {
  if (status === "RECEIVED" || status === "CONFIRMED") {
    return "paid";
  }

  if (status === "OVERDUE") {
    return "expired";
  }

  if (status === "REFUNDED") {
    return "refunded";
  }

  if (status === "DELETED") {
    return "canceled";
  }

  return "pending";
};

const toSubscriptionStatus = (status: string): Subscription["status"] => {
  if (status === "ACTIVE") {
    return "active";
  }

  if (status === "INACTIVE") {
    return "canceled";
  }

  return "pending_payment";
};

const toEventType = (event: string): BillingEvent["type"] => {
  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    return "payment.paid";
  }

  if (event === "PAYMENT_OVERDUE") {
    return "invoice.overdue";
  }

  if (event === "PAYMENT_REFUNDED") {
    return "payment.refunded";
  }

  if (event === "PAYMENT_CREATED") {
    return "payment.created";
  }

  if (event === "SUBSCRIPTION_CREATED") {
    return "subscription.created";
  }

  if (event === "SUBSCRIPTION_INACTIVATED") {
    return "subscription.canceled";
  }

  return "payment.pending";
};

const providerError = (message: string, status?: number) => {
  if (status === undefined) {
    return new BillingError({
      error: billingErrors.PROVIDER_REQUEST_FAILED(),
      message,
      provider: "asaas",
    });
  }

  return new BillingError({
    error: billingErrors.PROVIDER_REQUEST_FAILED(),
    message,
    provider: "asaas",
    status,
  });
};

const invalidResponseError = (message: string) =>
  new BillingError({
    error: billingErrors.PROVIDER_RESPONSE_INVALID(),
    message,
    provider: "asaas",
  });

const invalidConfigAdapter = (): PaymentProviderAdapter => {
  const invalidConfig = <T>(): BillingResult<T> =>
    Result.err<T, BillingError>(
      new BillingError({
        error: billingErrors.INVALID_INPUT(),
        message: asaasErrors.INVALID_CONFIG().message,
        provider: "asaas",
      }),
    );

  return {
    id: "asaas",
    createCustomer: async () => invalidConfig(),
    createCheckout: async () => invalidConfig(),
    createCharge: async () => invalidConfig(),
    createSubscription: async () => invalidConfig(),
    parseWebhook: async () => invalidConfig(),
  };
};

export const createAsaasAdapter = (input: AsaasAdapterOptions): PaymentProviderAdapter => {
  const parsedOptions = asaasAdapterOptionsSchema.safeParse(input);

  if (!parsedOptions.success) {
    return invalidConfigAdapter();
  }

  const options = parsedOptions.data;
  const baseUrl = baseUrlByEnvironment(options.environment);

  const request = async <T>(
    path: string,
    body: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<BillingResult<T>> => {
    const responseResult = await Result.tryPromise({
      try: () =>
        fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            access_token: options.apiKey,
          },
          body: JSON.stringify(body),
        }),
      catch: () => providerError("Falha ao chamar o Asaas."),
    });

    if (Result.isError(responseResult)) {
      return responseResult;
    }

    if (!responseResult.value.ok) {
      return Result.err(
        providerError("Asaas recusou a requisição.", responseResult.value.status),
      );
    }

    const jsonResult = await Result.tryPromise({
      try: () => responseResult.value.json(),
      catch: () => invalidResponseError("Resposta do Asaas não é JSON válido."),
    });

    if (Result.isError(jsonResult)) {
      return jsonResult;
    }

    const parsed = schema.safeParse(jsonResult.value);

    if (!parsed.success) {
      return Result.err(invalidResponseError("Resposta do Asaas inválida."));
    }

    return Result.ok(parsed.data);
  };

  const createCustomer = async (
    customer: CustomerInput,
  ): Promise<BillingResult<Customer>> => {
    const result = await request("/customers", {
      name: customer.name,
      email: customer.email,
      cpfCnpj: customer.document,
      phone: customer.phone,
    }, asaasCustomerResponseSchema);

    if (Result.isError(result)) {
      return result;
    }

    return Result.ok({
      id: result.value.id,
      providerCustomerId: result.value.id,
      name: result.value.name,
      email: result.value.email ?? customer.email,
      document: result.value.cpfCnpj ?? customer.document,
      documentType: detectDocumentType(result.value.cpfCnpj ?? customer.document),
      phone: result.value.phone ?? customer.phone,
      metadata: customer.metadata ?? {},
    });
  };

  const createCharge = async (
    charge: ChargeInput,
  ): Promise<BillingResult<Charge>> => {
    const result = await request("/payments", {
      customer: charge.customerId,
      billingType: toPaymentMethod(charge.method),
      value: toMajorUnits(charge.amount),
      dueDate: charge.boleto?.dueDate,
      description: charge.description,
    }, asaasPaymentResponseSchema);

    if (Result.isError(result)) {
      return result;
    }

    return Result.ok({
      id: result.value.id,
      providerChargeId: result.value.id,
      customerId: result.value.customer,
      amount: charge.amount,
      currency: charge.currency,
      method: charge.method,
      status: toChargeStatus(result.value.status),
      description: result.value.description,
      boleto: charge.boleto,
      card: charge.card,
      metadata: charge.metadata ?? {},
      boletoDetails:
        charge.method === "boleto"
          ? {
              bankSlipUrl: result.value.bankSlipUrl,
              dueDate: result.value.dueDate,
            }
          : undefined,
    });
  };

  return {
    id: "asaas",
    createCustomer,
    createCheckout: async (checkout: CheckoutInput): Promise<BillingResult<Checkout>> => {
      const method = checkout.methods[0] ?? "pix";
      const chargeResult = await createCharge({
        customerId: checkout.customerId,
        amount: 100,
        currency: "BRL",
        method,
        description: checkout.priceId,
        metadata: checkout.metadata,
      });

      if (Result.isError(chargeResult)) {
        return chargeResult;
      }

      return Result.ok({
        id: chargeResult.value.id,
        providerCheckoutId: chargeResult.value.providerChargeId,
        customerId: checkout.customerId,
        priceId: checkout.priceId,
        methods: checkout.methods,
        successUrl: checkout.successUrl,
        cancelUrl: checkout.cancelUrl,
        metadata: checkout.metadata ?? {},
        url: chargeResult.value.boletoDetails?.bankSlipUrl ?? "https://www.asaas.com/checkout",
      });
    },
    createCharge,
    createSubscription: async (
      subscription: SubscriptionInput,
    ): Promise<BillingResult<Subscription>> => {
      const result = await request("/subscriptions", {
        customer: subscription.customerId,
        billingType: toPaymentMethod(subscription.paymentMethod),
        value: 1,
        cycle: "MONTHLY",
        description: subscription.priceId,
      }, asaasSubscriptionResponseSchema);

      if (Result.isError(result)) {
        return result;
      }

      return Result.ok({
        id: result.value.id,
        providerSubscriptionId: result.value.id,
        customerId: result.value.customer,
        priceId: subscription.priceId,
        paymentMethod: subscription.paymentMethod,
        trialDays: subscription.trialDays,
        metadata: subscription.metadata ?? {},
        status: toSubscriptionStatus(result.value.status),
        currentPeriodEnd: result.value.nextDueDate,
      });
    },
    parseWebhook: async (requestInput: Request): Promise<BillingResult<BillingEvent>> => {
      const jsonResult = await Result.tryPromise({
        try: () => requestInput.json(),
        catch: () => invalidResponseError("Webhook do Asaas não é JSON válido."),
      });

      if (Result.isError(jsonResult)) {
        return jsonResult;
      }

      const parsed = asaasWebhookSchema.safeParse(jsonResult.value);

      if (!parsed.success) {
        return Result.err(invalidResponseError("Webhook do Asaas inválido."));
      }

      return Result.ok({
        id: parsed.data.payment?.id ?? parsed.data.subscription?.id ?? parsed.data.event,
        type: toEventType(parsed.data.event),
        provider: "asaas",
        customerId: parsed.data.payment?.customer ?? parsed.data.subscription?.customer,
        chargeId: parsed.data.payment?.id,
        subscriptionId: parsed.data.subscription?.id,
        occurredAt: new Date().toISOString(),
        payload: parsed.data,
      });
    },
  };
};
