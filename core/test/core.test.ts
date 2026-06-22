import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "@effect/vitest";
import { drizzle } from "drizzle-orm/pglite";
import { Effect, Exit } from "effect";
import { migrateHyprPayPostgresStore, postgresStore } from "../../stores/postgres/src/index";
import { hyprPayPostgresSchema } from "../../stores/postgres/src/schema";
import {
  benefit,
  capabilityUnsupported,
  createHyprPay,
  feature,
  plan,
  product,
  type PaymentProviderAdapter,
} from "../index";

const unsupportedProvider = (id: string): PaymentProviderAdapter => ({
  id,
  capabilities: {
    customers: false,
    checkouts: false,
    subscriptions: false,
    refunds: false,
    webhooks: false,
  },
  createCustomer: () => Effect.fail(capabilityUnsupported("customers")),
  createCheckout: () => Effect.fail(capabilityUnsupported("checkouts")),
  createSubscription: () => Effect.fail(capabilityUnsupported("subscriptions")),
  refund: () => Effect.fail(capabilityUnsupported("refunds")),
  parseWebhook: () => Effect.fail(capabilityUnsupported("webhooks")),
});

const testDirectories: string[] = [];

const createTestStore = async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "hyprpay-postgres-"));
  testDirectories.push(dataDir);
  const db = drizzle({ connection: { dataDir }, schema: hyprPayPostgresSchema });
  await Effect.runPromise(migrateHyprPayPostgresStore(db));
  return postgresStore({ db });
};

afterAll(async () => {
  await Promise.all(testDirectories.map(dataDir => rm(dataDir, { recursive: true, force: true })));
});

describe("createHyprPay", () => {
  it("creates a customer, checkout and pending order with only core logic", async () => {
    const store = await createTestStore();
    const hyprpay = createHyprPay({ store });

    const customer = await Effect.runPromise(
      hyprpay.customers.create({ name: "Empresa XPTO", email: "financeiro@xpto.com.br" }),
    );

    const checkout = await Effect.runPromise(
      hyprpay.checkouts.create({
        customerId: customer.id,
        amount: 12990,
        methods: ["pix", "boleto"],
        successUrl: "https://app.example.com/success",
      }),
    );
    const orders = await Effect.runPromise(hyprpay.orders.list({ customerId: customer.id }));

    expect(checkout.methods).toEqual(["pix", "boleto"]);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.status).toBe("pending");
    expect(orders[0]?.amount).toBe(12990);
  });

  it("captures core telemetry without affecting billing writes", async () => {
    const names: string[] = [];
    const hyprpay = createHyprPay({
      store: await createTestStore(),
      telemetry: {
        capture: event => {
          names.push(event.name);
          return Effect.void;
        },
      },
    });

    await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));

    expect(names).toEqual(["customer.created"]);
  });

  it("rejects checkout for missing customer", async () => {
    const hyprpay = createHyprPay({ store: await createTestStore() });

    const result = await Effect.runPromiseExit(
      hyprpay.checkouts.create({
        customerId: "missing",
        amount: 1000,
        successUrl: "https://app.example.com/success",
      }),
    );

    expect(Exit.isFailure(result)).toBe(true);
  });

  it("marks checkout and order as paid from a processor event", async () => {
    const store = await createTestStore();
    const hyprpay = createHyprPay({ store });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));
    const checkout = await Effect.runPromise(hyprpay.checkouts.create({ customerId: customer.id, amount: 12990 }));

    const event = await Effect.runPromise(
      hyprpay.webhooks.handle({
        processor: "manual-test",
        type: "checkout.paid",
        checkoutId: checkout.id,
        providerOrderId: "order_provider_1",
      }),
    );

    expect(event.type).toBe("checkout.paid");

    const updatedCheckout = await Effect.runPromise(hyprpay.checkouts.get(checkout.id));
    const orders = await Effect.runPromise(hyprpay.orders.list({ checkoutId: checkout.id }));
    expect(updatedCheckout?.status).toBe("paid");
    expect(orders[0]?.status).toBe("paid");
    expect(orders[0]?.providerOrderId).toBe("order_provider_1");
  });

  it("creates a subscription and updates its status from normalized events", async () => {
    const store = await createTestStore();
    const hyprpay = createHyprPay({ store });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));

    const subscription = await Effect.runPromise(hyprpay.subscriptions.create({ customerId: customer.id, planId: "pro" }));
    expect(subscription.status).toBe("pending");

    await Effect.runPromise(
      hyprpay.webhooks.handle({
        processor: "manual-test",
        type: "subscription.active",
        subscriptionId: subscription.id,
      }),
    );

    const updatedSubscription = await Effect.runPromise(hyprpay.subscriptions.get(subscription.id));
    expect(updatedSubscription?.status).toBe("active");
  });

  it("refunds a paid provider order", async () => {
    const refundedProviderOrders: string[] = [];
    const provider: PaymentProviderAdapter = {
      ...unsupportedProvider("contract-provider"),
      capabilities: {
        customers: false,
        checkouts: false,
        subscriptions: false,
        refunds: true,
        webhooks: false,
      },
      refund: (input) =>
        Effect.sync(() => {
          refundedProviderOrders.push(input.providerOrderId ?? "missing");
          return {
            provider: "contract-provider",
            providerRefundId: "refund_provider_1",
            status: "succeeded",
          };
        }),
    };
    const store = await createTestStore();
    const hyprpay = createHyprPay({ store, provider });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));
    const checkout = await Effect.runPromise(hyprpay.checkouts.create({ customerId: customer.id, amount: 12990 }));

    await Effect.runPromise(
      hyprpay.webhooks.handle({
        processor: "contract-provider",
        type: "checkout.paid",
        checkoutId: checkout.id,
        providerOrderId: "order_provider_1",
      }),
    );

    const orders = await Effect.runPromise(hyprpay.orders.list({ checkoutId: checkout.id }));
    const order = orders[0];
    const refund = await Effect.runPromise(
      hyprpay.refunds.create({
        orderId: order?.id ?? "missing",
        amount: 500,
        reason: "customer_request",
      }),
    );

    const refundedOrder = await Effect.runPromise(hyprpay.orders.get(order?.id ?? "missing"));
    expect(refund.providerRefundId).toBe("refund_provider_1");
    expect(refund.status).toBe("succeeded");
    expect(refundedProviderOrders).toEqual(["order_provider_1"]);
    expect(refundedOrder?.status).toBe("refunded");
  });

  it("stores customer references returned by a provider adapter", async () => {
    const provider: PaymentProviderAdapter = {
      ...unsupportedProvider("contract-provider"),
      capabilities: {
        customers: true,
        checkouts: false,
        subscriptions: false,
        refunds: false,
        webhooks: false,
      },
      createCustomer: (input) =>
        Effect.succeed({
          provider: "contract-provider",
          providerCustomerId: `provider_${input.externalId ?? "missing"}`,
        }),
    };
    const hyprpay = createHyprPay({ store: await createTestStore(), provider });

    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));

    expect(customer.provider).toBe("contract-provider");
    expect(customer.providerCustomerId).toBe(`provider_${customer.id}`);
  });

  it("stores checkout references returned by a provider adapter", async () => {
    const provider: PaymentProviderAdapter = {
      ...unsupportedProvider("contract-provider"),
      capabilities: {
        customers: false,
        checkouts: true,
        subscriptions: false,
        refunds: false,
        webhooks: false,
      },
      createCheckout: (input) => {
        const hyprpayCheckoutId = input.metadata?.hyprpayCheckoutId;
        const providerCheckoutId =
          typeof hyprpayCheckoutId === "string" ? `provider_${hyprpayCheckoutId}` : "provider_missing";

        return Effect.succeed({
          provider: "contract-provider",
          providerCheckoutId,
          checkoutUrl: "https://checkout.example.com/session",
        });
      },
    };
    const hyprpay = createHyprPay({ store: await createTestStore(), provider });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));

    const checkout = await Effect.runPromise(hyprpay.checkouts.create({ customerId: customer.id, amount: 12990 }));

    expect(checkout.provider).toBe("contract-provider");
    expect(checkout.providerCheckoutId).toBe(`provider_${checkout.id}`);
    expect(checkout.checkoutUrl).toBe("https://checkout.example.com/session");
  });

  it("stores subscription references returned by a provider adapter", async () => {
    const provider: PaymentProviderAdapter = {
      ...unsupportedProvider("contract-provider"),
      capabilities: {
        customers: false,
        checkouts: false,
        subscriptions: true,
        refunds: false,
        webhooks: false,
      },
      createSubscription: (input) => {
        const hyprpaySubscriptionId = input.metadata?.hyprpaySubscriptionId;
        const providerSubscriptionId =
          typeof hyprpaySubscriptionId === "string" ? `provider_${hyprpaySubscriptionId}` : "provider_missing";

        return Effect.succeed({
          provider: "contract-provider",
          providerSubscriptionId,
          status: "active",
        });
      },
    };
    const hyprpay = createHyprPay({ store: await createTestStore(), provider });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));

    const subscription = await Effect.runPromise(hyprpay.subscriptions.create({ customerId: customer.id, planId: "pro" }));

    expect(subscription.provider).toBe("contract-provider");
    expect(subscription.providerSubscriptionId).toBe(`provider_${subscription.id}`);
    expect(subscription.status).toBe("active");
  });

  it("receives provider webhooks through the adapter boundary", async () => {
    const store = await createTestStore();
    const provider: PaymentProviderAdapter = {
      ...unsupportedProvider("contract-provider"),
      capabilities: {
        customers: false,
        checkouts: false,
        subscriptions: false,
        refunds: false,
        webhooks: true,
      },
      parseWebhook: () =>
        Effect.succeed({
          id: "evt_provider_1",
          processor: "contract-provider",
          type: "checkout.paid",
          checkoutId,
          occurredAt: new Date().toISOString(),
        }),
    };
    const hyprpay = createHyprPay({ store, provider });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));
    const checkout = await Effect.runPromise(hyprpay.checkouts.create({ customerId: customer.id, amount: 12990 }));
    const checkoutId = checkout.id;

    const event = await Effect.runPromise(
      hyprpay.webhooks.receive({
        request: new Request("https://billing.example.com/webhooks/provider", { method: "POST" }),
      }),
    );

    const updatedCheckout = await Effect.runPromise(hyprpay.checkouts.get(checkoutId));
    expect(event.processor).toBe("contract-provider");
    expect(updatedCheckout?.status).toBe("paid");
  });

  it("defines PayKit-style catalog in code without binding it to a gateway", async () => {
    const messages = feature.metered({ id: "messages", reset: "month" });
    const proModels = feature.boolean({ id: "pro-models" });

    const free = plan({
      id: "free",
      group: "base",
      default: true,
      includes: [messages({ limit: 100 })],
    });

    const pro = plan({
      id: "pro",
      group: "base",
      price: { amountMinor: 1990, currency: "BRL", interval: "month" },
      includes: [messages({ limit: 2_000 }), proModels()],
    });

    const billing = product({
      id: "billing",
      name: "Billing",
      plans: [free, pro],
    });
    const hyprpay = createHyprPay({ store: await createTestStore(), catalog: [billing] });

    expect(hyprpay.catalog).toEqual([billing]);
    expect(billing.plans[1]?.includes[0]?.featureId).toBe("messages");
  });

  it("checks and reports metered default-plan entitlements locally", async () => {
    const messages = feature.metered({ id: "messages", reset: "month" });
    const free = plan({
      id: "free",
      group: "base",
      default: true,
      includes: [messages({ limit: 3 })],
    });
    const billing = product({
      id: "billing",
      name: "Billing",
      plans: [free],
    });
    const hyprpay = createHyprPay({ store: await createTestStore(), catalog: [billing] });

    const initial = await Effect.runPromise(hyprpay.entitlements.check({ customerId: "cus_123", featureId: "messages", amount: 2 }));
    expect(initial.allowed).toBe(true);
    expect(initial.balance?.remaining).toBe(3);

    const reported = await Effect.runPromise(
      hyprpay.entitlements.report({ customerId: "cus_123", featureId: "messages", amount: 2, idempotencyKey: "request_1" }),
    );
    expect(reported.success).toBe(true);
    expect(reported.balance?.remaining).toBe(1);

    const repeated = await Effect.runPromise(
      hyprpay.entitlements.report({ customerId: "cus_123", featureId: "messages", amount: 2, idempotencyKey: "request_1" }),
    );
    expect(repeated.balance?.remaining).toBe(1);

    const denied = await Effect.runPromise(hyprpay.entitlements.check({ customerId: "cus_123", featureId: "messages", amount: 2 }));
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("usage_limit_reached");
  });
  it("uses active paid-plan feature grants before default entitlements", async () => {
    const messages = feature.metered({ id: "messages", reset: "month" });
    const free = plan({
      id: "free",
      group: "base",
      default: true,
      includes: [messages({ limit: 1 })],
    });
    const pro = plan({
      id: "pro",
      group: "base",
      price: { amountMinor: 1990, currency: "BRL", interval: "month" },
      includes: [messages({ limit: 5 })],
    });
    const billing = product({
      id: "billing",
      name: "Billing",
      plans: [free, pro],
    });
    const hyprpay = createHyprPay({ store: await createTestStore(), catalog: [billing] });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));
    const subscription = await Effect.runPromise(hyprpay.subscriptions.create({ customerId: customer.id, planId: "pro" }));

    await Effect.runPromise(
      hyprpay.webhooks.handle({
        processor: "manual-test",
        type: "subscription.active",
        subscriptionId: subscription.id,
      }),
    );

    const initial = await Effect.runPromise(hyprpay.entitlements.check({ customerId: customer.id, featureId: "messages" }));
    expect(initial.allowed).toBe(true);
    expect(initial.balance?.remaining).toBe(5);

    await Effect.runPromise(
      hyprpay.entitlements.report({ customerId: customer.id, featureId: "messages", amount: 4, idempotencyKey: "use_1" }),
    );
    const afterUsage = await Effect.runPromise(
      hyprpay.entitlements.check({ customerId: customer.id, featureId: "messages", amount: 2 }),
    );

    expect(afterUsage.allowed).toBe(false);
    expect(afterUsage.balance?.remaining).toBe(1);
  });


  it("grants Polar-like benefits from paid checkouts without provider lock-in", async () => {
    const premiumAccess = feature.boolean({ id: "premium-access" });
    const pro = plan({
      id: "pro",
      includes: [
        premiumAccess(),
        benefit.featureFlag({ id: "premium-feature", featureId: "premium-access" }),
        benefit.licenseKey({ id: "license", prefix: "HYP", limitActivations: 1, limitUsage: 3 }),
        benefit.fileDownload({ id: "assets", fileId: "file_1", url: "https://cdn.example.com/file_1" }),
        benefit.seats({ id: "team-seats", quantity: 1 }),
      ],
    });
    const billing = product({
      id: "billing",
      name: "Billing",
      plans: [pro],
    });
    const hyprpay = createHyprPay({ store: await createTestStore(), catalog: [billing] });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));
    const checkout = await Effect.runPromise(
      hyprpay.checkouts.create({ customerId: customer.id, planId: "pro", amount: 1990 }),
    );

    await Effect.runPromise(
      hyprpay.webhooks.handle({
        processor: "manual-test",
        type: "checkout.paid",
        checkoutId: checkout.id,
      }),
    );

    const grants = await Effect.runPromise(hyprpay.benefits.list({ customerId: customer.id, status: "active" }));
    const licenseKeys = await Effect.runPromise(hyprpay.licenseKeys.list({ customerId: customer.id, status: "active" }));
    const download = await Effect.runPromise(hyprpay.downloads.getAccess({ customerId: customer.id, benefitId: "assets" }));
    const entitlement = await Effect.runPromise(
      hyprpay.entitlements.check({ customerId: customer.id, featureId: "premium-access" }),
    );
    const seat = await Effect.runPromise(hyprpay.seats.assign({ customerId: customer.id, memberId: "user_1" }));
    const duplicateSeat = await Effect.runPromise(hyprpay.seats.assign({ customerId: customer.id, memberId: "user_1" }));
    const overflowSeat = await Effect.runPromiseExit(hyprpay.seats.assign({ customerId: customer.id, memberId: "user_2" }));

    expect(grants).toHaveLength(4);
    expect(licenseKeys[0]?.key.startsWith("HYP_")).toBe(true);
    expect(download).toEqual({
      allowed: true,
      benefitId: "assets",
      fileId: "file_1",
      url: "https://cdn.example.com/file_1",
    });
    expect(entitlement.allowed).toBe(true);
    expect(duplicateSeat.id).toBe(seat.id);
    expect(Exit.isFailure(overflowSeat)).toBe(true);
  });

  it("records meters idempotently and creates customer portal sessions", async () => {
    const hyprpay = createHyprPay({
      store: await createTestStore(),
      portal: { baseUrl: "https://billing.example.com/portal", sessionTtlSeconds: 60 },
    });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));

    const usage = await Effect.runPromise(
      hyprpay.meters.record({ customerId: customer.id, meterId: "ai_tokens", amount: 5, idempotencyKey: "usage_1" }),
    );
    const duplicate = await Effect.runPromise(
      hyprpay.meters.record({ customerId: customer.id, meterId: "ai_tokens", amount: 5, idempotencyKey: "usage_1" }),
    );
    const summary = await Effect.runPromise(hyprpay.meters.summarize({ customerId: customer.id, meterId: "ai_tokens" }));
    const portalSession = await Effect.runPromise(
      hyprpay.portal.createSession({ customerId: customer.id, returnUrl: "https://app.example.com/settings" }),
    );

    expect(duplicate.id).toBe(usage.id);
    expect(summary.amount).toBe(5);
    expect(portalSession.url?.startsWith("https://billing.example.com/portal?token=")).toBe(true);
    expect(portalSession.returnUrl).toBe("https://app.example.com/settings");
  });

  it("validates license keys with activations and usage limits", async () => {
    const hyprpay = createHyprPay({ store: await createTestStore() });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));
    const licenseKey = await Effect.runPromise(
      hyprpay.licenseKeys.issue({
        customerId: customer.id,
        key: "HYP_TEST",
        activationsLimit: 1,
        usageLimit: 2,
      }),
    );

    const missingActivation = await Effect.runPromise(hyprpay.licenseKeys.validate({ key: licenseKey.key }));
    const activation = await Effect.runPromise(hyprpay.licenseKeys.activate({ key: licenseKey.key, instanceId: "device_1" }));
    const valid = await Effect.runPromise(
      hyprpay.licenseKeys.validate({ key: licenseKey.key, activationId: activation.id, incrementUsage: 2 }),
    );
    const overLimit = await Effect.runPromise(
      hyprpay.licenseKeys.validate({ key: licenseKey.key, activationId: activation.id, incrementUsage: 1 }),
    );

    expect(missingActivation).toMatchObject({ valid: false, reason: "activation_required" });
    expect(valid.valid).toBe(true);
    expect(valid.licenseKey?.usage).toBe(2);
    expect(overLimit).toMatchObject({ valid: false, reason: "usage_limit_reached" });
  });
});
