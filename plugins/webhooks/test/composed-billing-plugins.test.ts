import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import { catalog } from "../../catalog/src/catalog-plugin";
import { charges } from "../../charges/src/charges-plugin";
import { checkouts } from "../../checkouts/src/checkouts-plugin";
import { customers } from "../../customers/src/customers-plugin";
import { subscriptions } from "../../subscriptions/src/subscriptions-plugin";
import { webhooks } from "../src/webhooks-plugin";
import type { BillingEvent } from "../src/schemas/billing-event-schema";
import type { Charge } from "../../charges/src/schemas/charge-schema";
import type { Checkout } from "../../checkouts/src/schemas/checkout-schema";
import type { Customer } from "../../customers/src/schemas/customer-schema";
import type { Price } from "../../catalog/src/schemas/price-schema";
import type { Product } from "../../catalog/src/schemas/product-schema";
import type { Subscription, UsageRecord } from "../../subscriptions/src/schemas/subscription-schema";

const createDatabase = () => {
  const products = new Map<string, Product>();
  const prices = new Map<string, Price>();
  const customersMap = new Map<string, Customer>();
  const checkoutsMap = new Map<string, Checkout>();
  const chargesMap = new Map<string, Charge>();
  const subscriptionsMap = new Map<string, Subscription>();
  const events = new Map<string, BillingEvent>();

  return {
    catalog: {
      products: {
        create: async (input: Product) => {
          products.set(input.id, input);
          return Result.ok(input);
        },
        findById: async (id: string) => Result.ok(products.get(id) ?? null),
      },
      prices: {
        create: async (input: Price) => {
          prices.set(input.id, input);
          return Result.ok(input);
        },
        findById: async (id: string) => Result.ok(prices.get(id) ?? null),
      },
    },
    customers: {
      customers: {
        create: async (input: Customer) => {
          customersMap.set(input.id, input);
          return Result.ok(input);
        },
        findById: async (id: string) => Result.ok(customersMap.get(id) ?? null),
      },
    },
    checkouts: {
      checkouts: {
        create: async (input: Checkout) => {
          checkoutsMap.set(input.id, input);
          return Result.ok(input);
        },
        findById: async (id: string) => Result.ok(checkoutsMap.get(id) ?? null),
      },
    },
    charges: {
      charges: {
        create: async (input: Charge) => {
          chargesMap.set(input.id, input);
          return Result.ok(input);
        },
        update: async (input: Charge) => {
          chargesMap.set(input.id, input);
          return Result.ok(input);
        },
        findById: async (id: string) => Result.ok(chargesMap.get(id) ?? null),
      },
    },
    subscriptions: {
      subscriptions: {
        create: async (input: Subscription) => {
          subscriptionsMap.set(input.id, input);
          return Result.ok(input);
        },
        update: async (input: Subscription) => {
          subscriptionsMap.set(input.id, input);
          return Result.ok(input);
        },
        findById: async (id: string) => Result.ok(subscriptionsMap.get(id) ?? null),
      },
    },
    webhooks: {
      events: {
        append: async (input: BillingEvent & { externalId: string }) => {
          events.set(`${input.provider}:${input.externalId}`, input);
          return Result.ok(input);
        },
        hasProcessed: async (provider: string, externalId: string) => Result.ok(events.has(`${provider}:${externalId}`)),
      },
    },
  };
};

const createProviders = () => ({
  catalog: {
    id: "abacatepay",
    createProduct: async (input: { externalId: string; name: string; description?: string; metadata?: Record<string, string> }) =>
      Result.ok({
        id: `prod_${input.externalId}`,
        slug: input.externalId,
        name: input.name,
        description: input.description,
        metadata: input.metadata ?? {},
        active: true,
      }),
  },
  customers: {
    id: "abacatepay",
    createCustomer: async (input: { name: string; email?: string; document: string; phone?: string; metadata?: Record<string, string> }) =>
      Result.ok({
        id: "cust_123",
        providerCustomerId: "cust_123",
        name: input.name,
        email: input.email,
        document: input.document,
        documentType: "cnpj",
        phone: input.phone,
        metadata: input.metadata ?? {},
      }),
  },
  checkouts: {
    id: "abacatepay",
    createCheckout: async (input: { customerId: string; priceId: string; methods: Array<"pix" | "boleto" | "card">; providerProductId: string; successUrl?: string; cancelUrl?: string; metadata?: Record<string, string> }) =>
      Result.ok({
        id: "chk_123",
        providerCheckoutId: "chk_123",
        customerId: input.customerId,
        priceId: input.priceId,
        methods: input.methods,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        metadata: input.metadata ?? {},
        providerProductId: input.providerProductId,
        url: "https://pay.example/chk_123",
        amount: 4990,
        currency: "BRL",
        status: "pending",
      }),
  },
  charges: {
    id: "abacatepay",
    createCharge: async (input: { customerId: string; amount: number; currency: "BRL"; method: "pix" | "boleto" | "card"; description?: string; metadata?: Record<string, string>; boleto?: { dueDate?: string }; card?: { installments?: number } }) =>
      Result.ok({
        id: "chg_123",
        providerChargeId: "chg_123",
        customerId: input.customerId,
        amount: input.amount,
        currency: input.currency,
        method: input.method,
        status: "pending",
        description: input.description,
        boleto: input.boleto,
        card: input.card,
        metadata: input.metadata ?? {},
      }),
  },
  subscriptions: {
    id: "abacatepay",
    createSubscription: async (input: { customerId: string; priceId: string; paymentMethod: "pix" | "boleto" | "card"; providerProductId: string; trialDays?: number; metadata?: Record<string, string> }) =>
      Result.ok({
        id: "sub_123",
        providerSubscriptionId: "sub_123",
        customerId: input.customerId,
        priceId: input.priceId,
        paymentMethod: input.paymentMethod,
        trialDays: input.trialDays,
        metadata: input.metadata ?? {},
        providerProductId: input.providerProductId,
        status: "active",
        cancelAtPeriodEnd: false,
      }),
    cancelSubscription: async (input: { subscriptionId: string }) =>
      Result.ok({
        id: input.subscriptionId,
        providerSubscriptionId: input.subscriptionId,
        customerId: "cust_123",
        priceId: "price_123",
        paymentMethod: "card",
        metadata: {},
        status: "canceled",
        cancelAtPeriodEnd: false,
        canceledAt: "2026-06-08T00:00:00.000Z",
      }),
    recordUsage: async (input: { subscriptionId: string; productId: string; units: number; action: "add" | "subtract" }) =>
      Result.ok({
        id: "use_123",
        subscriptionId: input.subscriptionId,
        productId: input.productId,
        units: input.units,
        unitPrice: 100,
        action: input.action,
        installmentNumber: 1,
        recordedAt: "2026-06-08T00:00:00.000Z",
      } satisfies UsageRecord),
  },
  webhooks: {
    id: "abacatepay",
    verifyWebhook: async () => Result.ok(undefined),
    parseWebhook: async () =>
      Result.ok({
        id: "chk_123",
        externalId: "evt_123",
        type: "checkout.completed",
        provider: "abacatepay",
        customerId: "cust_123",
        chargeId: "chg_123",
        occurredAt: "2026-06-08T00:00:00.000Z",
        payload: { ok: true },
      }),
  },
});

describe("billing plugins composition", () => {
  it("composes focused plugins under dedicated namespaces", async () => {
    const database = createDatabase();
    const providers = createProviders();

    const hyprpay = createHyprPay({
      plugins: [
        catalog({ database: database.catalog, provider: providers.catalog }),
        customers({ database: database.customers, provider: providers.customers }),
        checkouts({ database: database.checkouts, catalog: database.catalog, provider: providers.checkouts }),
        charges({ database: database.charges, provider: providers.charges }),
        subscriptions({ database: database.subscriptions, catalog: database.catalog, provider: providers.subscriptions }),
        webhooks({
          database: database.webhooks,
          charges: database.charges,
          checkouts: database.checkouts,
          subscriptions: database.subscriptions,
          provider: providers.webhooks,
          webhookPath: "/billing/webhooks",
        }),
      ] as const,
    });

    const product = await hyprpay.api.catalog.products.create({
      slug: "pro",
      name: "Plano Pro",
    });
    expect(Result.isOk(product)).toBe(true);
    if (Result.isError(product)) throw new Error("expected product");

    const price = await hyprpay.api.catalog.prices.create({
      productId: product.value.id,
      slug: "pro-monthly",
      amount: 4990,
      currency: "BRL",
      interval: "month",
    });
    expect(Result.isOk(price)).toBe(true);
    if (Result.isError(price)) throw new Error("expected price");

    const customer = await hyprpay.api.customers.create({
      name: "Empresa XPTO",
      email: "financeiro@xpto.com.br",
      document: "12345678000199",
    });
    expect(Result.isOk(customer)).toBe(true);

    const checkout = await hyprpay.api.checkouts.create({
      customerId: "cust_123",
      priceId: price.value.id,
      methods: ["pix"],
    });
    expect(Result.isOk(checkout)).toBe(true);

    const charge = await hyprpay.api.charges.create({
      customerId: "cust_123",
      amount: 4990,
      currency: "BRL",
      method: "pix",
    });
    expect(Result.isOk(charge)).toBe(true);

    const subscription = await hyprpay.api.subscriptions.create({
      customerId: "cust_123",
      priceId: price.value.id,
      paymentMethod: "card",
    });
    expect(Result.isOk(subscription)).toBe(true);

    const usage = await hyprpay.api.subscriptions.recordUsage({
      subscriptionId: "sub_123",
      productId: product.value.id,
      units: 2,
      action: "add",
    });
    expect(Result.isOk(usage)).toBe(true);

    const webhookResponse = await hyprpay.handler(
      new Request("https://example.com/billing/webhooks", { method: "POST" }),
    );
    const webhookBody = await webhookResponse.json();
    const success = typeof webhookBody === "object" && webhookBody !== null ? Reflect.get(webhookBody, "success") : undefined;

    expect(webhookResponse.status).toBe(200);
    expect(success).toBe(true);
  });
});
