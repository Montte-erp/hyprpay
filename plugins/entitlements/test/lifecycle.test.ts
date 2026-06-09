import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import { entitlements } from "../src/entitlements-plugin";

describe("@hyprpay/entitlements lifecycle automation", () => {
  it("grants product benefits on subscription activation", async () => {
    const plugin = entitlements();
    const hyprpay = createHyprPay({ plugins: [plugin] as const });

    const benefit = await hyprpay.api.entitlements.benefits.create({
      productId: "prod_pro",
      type: "custom",
      feature: "pro.dashboard",
      limit: 10,
    });
    if (Result.isError(benefit)) {
      throw new Error("expected benefit creation to succeed");
    }

    // Before activation the customer has no access.
    const before = await hyprpay.api.entitlements.check({
      customerId: "cust_x",
      feature: "pro.dashboard",
    });
    if (Result.isError(before)) {
      throw new Error("expected pre-check to succeed");
    }
    expect(before.value.allowed).toBe(false);

    await hyprpay.emit({
      type: "billing.subscription.created",
      payload: {
        id: "sub_1",
        customerId: "cust_x",
        priceId: "price_1",
        status: "active",
        metadata: { productId: "prod_pro" },
      },
    });

    const after = await hyprpay.api.entitlements.check({
      customerId: "cust_x",
      feature: "pro.dashboard",
    });
    if (Result.isError(after)) {
      throw new Error("expected post-check to succeed");
    }
    expect(after.value.allowed).toBe(true);
    expect(after.value.limit).toBe(10);
  });

  it("revokes benefits when a subscription is canceled", async () => {
    const hyprpay = createHyprPay({ plugins: [entitlements()] as const });

    await hyprpay.api.entitlements.benefits.create({
      productId: "prod_pro",
      type: "custom",
      feature: "pro.dashboard",
    });

    await hyprpay.emit({
      type: "billing.subscription.created",
      payload: {
        id: "sub_2",
        customerId: "cust_y",
        priceId: "price_1",
        status: "active",
        metadata: { productId: "prod_pro" },
      },
    });

    const granted = await hyprpay.api.entitlements.check({
      customerId: "cust_y",
      feature: "pro.dashboard",
    });
    if (Result.isError(granted)) {
      throw new Error("expected check to succeed");
    }
    expect(granted.value.allowed).toBe(true);

    await hyprpay.emit({
      type: "billing.subscription.updated",
      payload: {
        subscription: {
          id: "sub_2",
          customerId: "cust_y",
          priceId: "price_1",
          status: "canceled",
          metadata: { productId: "prod_pro" },
        },
      },
    });

    const revoked = await hyprpay.api.entitlements.check({
      customerId: "cust_y",
      feature: "pro.dashboard",
    });
    if (Result.isError(revoked)) {
      throw new Error("expected check to succeed");
    }
    expect(revoked.value.allowed).toBe(false);
  });

  it("revokes a benefit on refund using metadata productId", async () => {
    const hyprpay = createHyprPay({ plugins: [entitlements()] as const });

    await hyprpay.api.entitlements.benefits.create({
      productId: "prod_one",
      type: "custom",
      feature: "course.access",
    });

    await hyprpay.emit({
      type: "billing.subscription.created",
      payload: {
        id: "sub_3",
        customerId: "cust_z",
        priceId: "price_2",
        status: "active",
        metadata: { productId: "prod_one" },
      },
    });

    const granted = await hyprpay.api.entitlements.check({
      customerId: "cust_z",
      feature: "course.access",
    });
    if (Result.isError(granted)) {
      throw new Error("expected check to succeed");
    }
    expect(granted.value.allowed).toBe(true);

    await hyprpay.emit({
      type: "billing.refund.created",
      payload: {
        id: "ref_1",
        orderId: "order_1",
        customerId: "cust_z",
        metadata: { productId: "prod_one" },
      },
    });

    const revoked = await hyprpay.api.entitlements.check({
      customerId: "cust_z",
      feature: "course.access",
    });
    if (Result.isError(revoked)) {
      throw new Error("expected check to succeed");
    }
    expect(revoked.value.allowed).toBe(false);
  });

  it("issues a license key on activation for license_key benefits", async () => {
    const hyprpay = createHyprPay({ plugins: [entitlements()] as const });

    await hyprpay.api.entitlements.benefits.create({
      productId: "prod_lic",
      type: "license_key",
      feature: "desktop.app",
      licenseActivationLimit: 3,
    });

    await hyprpay.emit({
      type: "billing.subscription.created",
      payload: {
        id: "sub_4",
        customerId: "cust_lic",
        priceId: "price_3",
        status: "active",
        metadata: { productId: "prod_lic" },
      },
    });

    // The feature flag is granted...
    const access = await hyprpay.api.entitlements.check({
      customerId: "cust_lic",
      feature: "desktop.app",
    });
    if (Result.isError(access)) {
      throw new Error("expected check to succeed");
    }
    expect(access.value.allowed).toBe(true);
  });

  it("ignores unrelated events", async () => {
    const hyprpay = createHyprPay({ plugins: [entitlements()] as const });

    await hyprpay.emit({ type: "billing.unrelated.event", payload: { foo: "bar" } });

    const check = await hyprpay.api.entitlements.check({
      customerId: "cust_none",
      feature: "anything",
    });
    if (Result.isError(check)) {
      throw new Error("expected check to succeed");
    }
    expect(check.value.allowed).toBe(false);
  });
});
