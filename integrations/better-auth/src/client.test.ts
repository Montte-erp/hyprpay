import { describe, expect, it } from "@effect/vitest";
import { betterAuthHyprPayClient } from "./client";

describe("betterAuthHyprPayClient", () => {
  it("registers billing routes under the HyprPay namespace", () => {
    const plugin = betterAuthHyprPayClient();

    expect(plugin.id).toBe("hyprpay");
    expect(plugin.pathMethods).toEqual({
      "/hyprpay/customer/sync": "POST",
      "/hyprpay/subscription/upgrade": "POST",
      "/hyprpay/subscription/list": "GET",
      "/hyprpay/subscription/billing-portal": "POST",
    });
  });
});
