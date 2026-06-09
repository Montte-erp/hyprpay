import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createAbacatePayAdapter, createAbacatePayGateway } from "../src/create-abacate-pay-adapter";
import { ABACATEPAY_PUBLIC_WEBHOOK_KEY } from "../src/abacatepay-env";

const webhookPayload = JSON.stringify({
  id: "log_123",
  event: "subscription.completed",
  createdAt: "2026-06-08T00:00:00.000Z",
  data: {
    customer: { id: "cust_123" },
    subscription: { id: "sub_123", updatedAt: "2026-06-08T00:00:00.000Z" },
    payment: { id: "pay_123", externalId: "order_123" },
  },
});

const signature = createHmac("sha256", ABACATEPAY_PUBLIC_WEBHOOK_KEY)
  .update(Buffer.from(webhookPayload, "utf8"))
  .digest("base64");

describe("createAbacatePayGateway", () => {
  it("rejects invalid config through typed failures", async () => {
    const gateway = createAbacatePayGateway({
      apiKey: "",
      environment: "sandbox",
    });

    const result = await gateway.customers.createCustomer({
      name: "Empresa XPTO",
      email: "financeiro@xpto.com.br",
      document: "12345678000199",
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("keeps the adapter alias pointing at the gateway factory", async () => {
    const gateway = createAbacatePayAdapter({
      apiKey: "",
      environment: "sandbox",
    });

    const result = await gateway.catalog.createProduct?.({
      externalId: "pro",
      name: "Plano Pro",
      amount: 4990,
      currency: "BRL",
      interval: "month",
    });

    expect(result).toBeDefined();
    expect(Result.isError(result!)).toBe(true);
  });

  it("verifies and parses AbacatePay webhooks", async () => {
    const gateway = createAbacatePayGateway({
      apiKey: "test_key",
      environment: "sandbox",
      webhookSecret: "secret_123",
    });

    const request = new Request("https://example.com/webhooks?webhookSecret=secret_123", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
      },
      body: webhookPayload,
    });

    const verification = await gateway.webhooks.verifyWebhook?.(request.clone());
    const event = await gateway.webhooks.parseWebhook(request);

    expect(verification).toBeDefined();
    expect(Result.isOk(verification!)).toBe(true);
    expect(Result.isOk(event)).toBe(true);

    if (Result.isError(event)) {
      throw new Error("expected webhook parsing to succeed");
    }

    expect(event.value.type).toBe("subscription.completed");
    expect(event.value.subscriptionId).toBe("sub_123");
    expect(event.value.chargeId).toBe("pay_123");
  });
});
