import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import { createInMemoryEntitlementStore } from "../src/in-memory-entitlement-store";
import { entitlements } from "../src/entitlements-plugin";

describe("@hyprpay/entitlements", () => {
  it("tracks grants and consumption in memory", async () => {
    const store = createInMemoryEntitlementStore();
    const hyprpay = createHyprPay({
      plugins: [entitlements({ store })] as const,
    });

    const grant = await hyprpay.api.entitlements.grant({
      customerId: "cust_123",
      feature: "invoices.generate",
      limit: 2,
    });

    expect(Result.isOk(grant)).toBe(true);

    const firstConsume = await hyprpay.api.entitlements.consume({
      customerId: "cust_123",
      feature: "invoices.generate",
      amount: 1,
    });

    expect(Result.isOk(firstConsume)).toBe(true);

    const secondConsume = await hyprpay.api.entitlements.consume({
      customerId: "cust_123",
      feature: "invoices.generate",
      amount: 2,
    });

    expect(Result.isError(secondConsume)).toBe(true);
  });

  it("starts with initial grants when no store is injected", async () => {
    const hyprpay = createHyprPay({
      plugins: [
        entitlements({
          initialGrants: [
            {
              customerId: "cust_123",
              feature: "reports.export",
              limit: 1,
            },
          ],
        }),
      ] as const,
    });

    const check = await hyprpay.api.entitlements.check({
      customerId: "cust_123",
      feature: "reports.export",
    });

    expect(Result.isOk(check)).toBe(true);

    if (Result.isError(check)) {
      throw new Error("expected entitlement check to succeed");
    }

    expect(check.value.allowed).toBe(true);
    expect(check.value.remaining).toBe(1);
  });

  it("revokes a granted entitlement so it is no longer allowed", async () => {
    const hyprpay = createHyprPay({
      plugins: [entitlements()] as const,
    });

    await hyprpay.api.entitlements.grant({
      customerId: "cust_456",
      feature: "exports.run",
      limit: 3,
    });

    const beforeRevoke = await hyprpay.api.entitlements.check({
      customerId: "cust_456",
      feature: "exports.run",
    });

    if (Result.isError(beforeRevoke)) {
      throw new Error("expected check to succeed");
    }

    expect(beforeRevoke.value.allowed).toBe(true);

    const revoke = await hyprpay.api.entitlements.revoke({
      customerId: "cust_456",
      feature: "exports.run",
    });

    if (Result.isError(revoke)) {
      throw new Error("expected revoke to succeed");
    }

    expect(revoke.value.allowed).toBe(false);

    const afterRevoke = await hyprpay.api.entitlements.check({
      customerId: "cust_456",
      feature: "exports.run",
    });

    if (Result.isError(afterRevoke)) {
      throw new Error("expected check to succeed");
    }

    expect(afterRevoke.value.allowed).toBe(false);
  });
});
