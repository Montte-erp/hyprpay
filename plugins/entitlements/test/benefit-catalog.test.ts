import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import { entitlements } from "../src/entitlements-plugin";

describe("@hyprpay/entitlements benefit catalog", () => {
  it("creates a custom benefit attached to a product and lists it", async () => {
    const hyprpay = createHyprPay({ plugins: [entitlements()] as const });

    const created = await hyprpay.api.entitlements.benefits.create({
      productId: "prod_1",
      type: "custom",
      feature: "reports.export",
      limit: 5,
    });

    expect(Result.isOk(created)).toBe(true);

    if (Result.isError(created)) {
      throw new Error("expected benefit creation to succeed");
    }

    expect(created.value.id).toBeString();
    expect(created.value.createdAt).toBeString();
    expect(created.value.type).toBe("custom");
    expect(created.value.limit).toBe(5);

    const fetched = await hyprpay.api.entitlements.benefits.get(created.value.id);
    expect(Result.isOk(fetched)).toBe(true);

    if (Result.isError(fetched)) {
      throw new Error("expected benefit fetch to succeed");
    }

    expect(fetched.value?.feature).toBe("reports.export");

    const listed = await hyprpay.api.entitlements.benefits.listByProduct("prod_1");

    if (Result.isError(listed)) {
      throw new Error("expected benefit list to succeed");
    }

    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]?.id).toBe(created.value.id);
  });

  it("defaults the benefit type to custom and rejects invalid input", async () => {
    const hyprpay = createHyprPay({ plugins: [entitlements()] as const });

    const created = await hyprpay.api.entitlements.benefits.create({
      productId: "prod_2",
      feature: "api.access",
    });

    if (Result.isError(created)) {
      throw new Error("expected benefit creation to succeed");
    }

    expect(created.value.type).toBe("custom");

    const invalid = await hyprpay.api.entitlements.benefits.create({
      productId: "",
      feature: "",
    });

    expect(Result.isError(invalid)).toBe(true);
  });

  it("returns null for an unknown benefit id", async () => {
    const hyprpay = createHyprPay({ plugins: [entitlements()] as const });

    const fetched = await hyprpay.api.entitlements.benefits.get("does-not-exist");

    if (Result.isError(fetched)) {
      throw new Error("expected lookup to succeed with null");
    }

    expect(fetched.value).toBeNull();
  });
});
