import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { betterAuthHyprPay, type HyprPayBetterAuthRuntime } from "./server";

const runtime: HyprPayBetterAuthRuntime = {
  catalog: [],
  customers: {
    create: input => Effect.succeed({
      ...input,
      id: "cus_1",
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
    }),
    findByExternalId: () => Effect.succeed(null),
  },
  checkouts: {
    create: input => Effect.succeed({
      ...input,
      id: "chk_1",
      currency: input.currency ?? "BRL",
      status: "pending",
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
    }),
  },
  subscriptions: {
    list: () => Effect.succeed([]),
  },
  portal: {
    createSession: input => Effect.succeed({
      ...input,
      id: "portal_1",
      token: "portal_token",
      expiresAt: "2026-06-22T00:10:00.000Z",
      createdAt: "2026-06-22T00:00:00.000Z",
    }),
  },
};

describe("betterAuthHyprPay", () => {
  it("uses the same plugin id on server and client integration", () => {
    const plugin = betterAuthHyprPay({ hyprpay: runtime });

    expect(plugin.id).toBe("hyprpay");
  });

  it("registers only HyprPay namespaced endpoints", () => {
    const plugin = betterAuthHyprPay({ hyprpay: runtime });

    expect(Object.keys(plugin.endpoints ?? {})).toEqual([
      "hyprpaySyncCustomer",
      "hyprpaySubscriptionUpgrade",
      "hyprpaySubscriptionList",
      "hyprpayBillingPortal",
    ]);
  });

  it("publishes a stable Better Auth error code", () => {
    const plugin = betterAuthHyprPay({ hyprpay: runtime });

    expect(plugin.$ERROR_CODES?.HYPERPAY_BILLING_FAILED).toEqual({
      code: "HYPERPAY_BILLING_FAILED",
      message: "Falha ao executar billing.",
    });
  });
});
