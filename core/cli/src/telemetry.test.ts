import { describe, expect, it } from "@effect/vitest";
import { isHyprPayCliTelemetryDisabled } from "./telemetry";

describe("HyprPay CLI telemetry", () => {
  it("stays disabled until explicitly enabled", () => {
    expect(isHyprPayCliTelemetryDisabled({ POSTHOG_API_KEY: "phc_test" })).toBe(true);
  });

  it("enables PostHog telemetry through env opt-in", () => {
    expect(isHyprPayCliTelemetryDisabled({ HYPERPAY_TELEMETRY: "1", POSTHOG_API_KEY: "phc_test" })).toBe(false);
  });

  it("honors explicit opt-out even when enabled", () => {
    expect(isHyprPayCliTelemetryDisabled({
      HYPERPAY_TELEMETRY: "1",
      HYPERPAY_TELEMETRY_DISABLED: "1",
      POSTHOG_API_KEY: "phc_test",
    })).toBe(true);
  });
});
