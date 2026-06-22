import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { normalizeAbacatePayWebhookPayload, toAbacatePayBillingRequest } from "./index";
import type { ProviderCheckoutInput } from "@hyprpay/core/adapter";

const checkoutInput: ProviderCheckoutInput = {
  customerId: "cus_123",
  amount: 12990,
  methods: ["pix", "card"],
  successUrl: "https://app.example.com/success",
  cancelUrl: "https://app.example.com/cancel",
  description: "Plano Pro",
  metadata: { hyprpayCheckoutId: "chk_123" },
  customer: {
    id: "cus_123",
    name: "Empresa XPTO",
    createdAt: "2026-06-21T12:00:00.000Z",
    updatedAt: "2026-06-21T12:00:00.000Z",
  },
};

describe("AbacatePay request mapping", () => {
  it("maps hosted billing links from core checkout input", async () => {
    const request = await Effect.runPromise(toAbacatePayBillingRequest(checkoutInput));

    expect(request.frequency).toBe("ONE_TIME");
    expect(request.methods).toEqual(["PIX", "CARD"]);
    expect(request.returnUrl).toBe("https://app.example.com/cancel");
    expect(request.completionUrl).toBe("https://app.example.com/success");
    expect(request.externalId).toBe("chk_123");
    expect(request.products[0]?.price).toBe(12990);
  });
});

describe("normalizeAbacatePayWebhookPayload", () => {
  it("maps paid billings to checkout paid events", () => {
    const event = normalizeAbacatePayWebhookPayload({
      id: "log_123",
      event: "billing.paid",
      data: {
        id: "bill_123",
        externalId: "chk_123",
        amount: 12990,
        updatedAt: "2026-06-21T12:00:00.000Z",
      },
    });

    expect(event.processor).toBe("abacate-pay");
    expect(event.type).toBe("checkout.paid");
    expect(event.checkoutId).toBe("chk_123");
    expect(event.providerOrderId).toBe("bill_123");
    expect(event.amount).toBe(12990);
    expect(event.occurredAt).toBe("2026-06-21T12:00:00.000Z");
  });
});
