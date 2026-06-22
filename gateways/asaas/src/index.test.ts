import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { normalizeAsaasWebhookPayload, toAsaasCustomerRequest, toAsaasPaymentRequest } from "./index";
import type { ProviderCheckoutInput } from "@hyprpay/core/adapter";

const checkoutInput: ProviderCheckoutInput = {
  customerId: "cus_123",
  amount: 12990,
  methods: ["pix"],
  successUrl: "https://app.example.com/success",
  description: "Plano Pro",
  metadata: { hyprpayCheckoutId: "chk_123" },
  customer: {
    id: "cus_123",
    name: "Empresa XPTO",
    provider: "asaas",
    providerCustomerId: "cus_provider_123",
    createdAt: "2026-06-21T12:00:00.000Z",
    updatedAt: "2026-06-21T12:00:00.000Z",
  },
};

describe("Asaas request mapping", () => {
  it("maps core customers to Asaas customers", () => {
    expect(
      toAsaasCustomerRequest({
        name: "Empresa XPTO",
        email: "financeiro@xpto.com.br",
        document: "12345678000199",
        externalId: "cus_123",
      }),
    ).toEqual({
      name: "Empresa XPTO",
      email: "financeiro@xpto.com.br",
      cpfCnpj: "12345678000199",
      externalReference: "cus_123",
    });
  });

  it("maps hosted checkout payment requests without leaking gateway concerns to core", async () => {
    const request = await Effect.runPromise(toAsaasPaymentRequest(checkoutInput));

    expect(request.customer).toBe("cus_provider_123");
    expect(request.billingType).toBe("PIX");
    expect(request.value).toBe(129.9);
    expect(request.externalReference).toBe("chk_123");
    expect(request.callback?.successUrl).toBe("https://app.example.com/success");
  });
});

describe("normalizeAsaasWebhookPayload", () => {
  it("maps received payments to checkout paid events", () => {
    const event = normalizeAsaasWebhookPayload({
      id: "evt_123",
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_123",
        externalReference: "chk_123",
        value: 129.9,
      },
    });

    expect(event.processor).toBe("asaas");
    expect(event.type).toBe("checkout.paid");
    expect(event.checkoutId).toBe("chk_123");
    expect(event.providerOrderId).toBe("pay_123");
    expect(event.amount).toBe(12990);
  });
});
