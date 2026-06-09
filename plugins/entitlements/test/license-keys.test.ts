import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import { entitlements } from "../src/entitlements-plugin";
import { generateLicenseKeyMaterial } from "../src/license-key-service";

describe("@hyprpay/entitlements license keys", () => {
  it("generates unique, formatted key material with crypto", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const material = generateLicenseKeyMaterial();
      expect(material).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      keys.add(material);
    }
    expect(keys.size).toBe(50);
  });

  it("issues, validates, activates and revokes a license key", async () => {
    const hyprpay = createHyprPay({ plugins: [entitlements()] as const });

    const issued = await hyprpay.api.entitlements.licenseKeys.issue({
      benefitId: "ben_1",
      customerId: "cust_1",
      activationLimit: 2,
    });
    if (Result.isError(issued)) {
      throw new Error("expected license key issuance to succeed");
    }
    const licenseKey = issued.value;

    expect(licenseKey.status).toBe("active");
    expect(licenseKey.activationCount).toBe(0);

    const validation = await hyprpay.api.entitlements.licenseKeys.validate({ key: licenseKey.key });
    if (Result.isError(validation)) {
      throw new Error("expected validation to succeed");
    }
    expect(validation.value.valid).toBe(true);
    expect(validation.value.remainingActivations).toBe(2);

    const firstActivate = await hyprpay.api.entitlements.licenseKeys.activate({ key: licenseKey.key });
    if (Result.isError(firstActivate)) {
      throw new Error("expected first activation to succeed");
    }
    expect(firstActivate.value.activationCount).toBe(1);

    const secondActivate = await hyprpay.api.entitlements.licenseKeys.activate({ key: licenseKey.key });
    if (Result.isError(secondActivate)) {
      throw new Error("expected second activation to succeed");
    }
    expect(secondActivate.value.activationCount).toBe(2);

    const thirdActivate = await hyprpay.api.entitlements.licenseKeys.activate({ key: licenseKey.key });
    expect(Result.isError(thirdActivate)).toBe(true);

    const revoked = await hyprpay.api.entitlements.licenseKeys.revoke({ key: licenseKey.key });
    if (Result.isError(revoked)) {
      throw new Error("expected revoke to succeed");
    }
    expect(revoked.value.status).toBe("revoked");
    expect(revoked.value.revokedAt).toBeString();

    const activateAfterRevoke = await hyprpay.api.entitlements.licenseKeys.activate({
      key: licenseKey.key,
    });
    expect(Result.isError(activateAfterRevoke)).toBe(true);
  });

  it("marks an expired key as expired on validation and blocks activation", async () => {
    const hyprpay = createHyprPay({ plugins: [entitlements()] as const });

    const issued = await hyprpay.api.entitlements.licenseKeys.issue({
      benefitId: "ben_2",
      customerId: "cust_2",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    if (Result.isError(issued)) {
      throw new Error("expected license key issuance to succeed");
    }
    const licenseKey = issued.value;

    const validation = await hyprpay.api.entitlements.licenseKeys.validate({ key: licenseKey.key });
    if (Result.isError(validation)) {
      throw new Error("expected validation to succeed");
    }
    expect(validation.value.valid).toBe(false);
    expect(validation.value.status).toBe("expired");

    const activate = await hyprpay.api.entitlements.licenseKeys.activate({ key: licenseKey.key });
    expect(Result.isError(activate)).toBe(true);
  });

  it("fails validation for an unknown key", async () => {
    const hyprpay = createHyprPay({ plugins: [entitlements()] as const });

    const validation = await hyprpay.api.entitlements.licenseKeys.validate({ key: "AAAA-BBBB-CCCC-DDDD" });
    expect(Result.isError(validation)).toBe(true);
  });
});
