import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { createHyprPayGatewayProvider } from "./gateways";

describe("createHyprPayGatewayProvider", () => {
  it.effect("selects the enabled Asaas gateway", () =>
    Effect.gen(function* () {
      const provider = yield* createHyprPayGatewayProvider({
        asaas: { apiKey: "asaas_test", server: "sandbox" },
        abacatePay: null,
      });

      expect(provider?.id).toBe("asaas");
      expect(provider?.capabilities.checkouts).toBe(true);
    }));

  it.effect("selects the enabled Abacate Pay gateway", () =>
    Effect.gen(function* () {
      const provider = yield* createHyprPayGatewayProvider({
        asaas: { apiKey: "asaas_test", enabled: false },
        abacatePay: { apiKey: "abacate_test" },
      });

      expect(provider?.id).toBe("abacate-pay");
      expect(provider?.capabilities.customers).toBe(false);
    }));

  it.effect("fails when two payment gateways are enabled", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(createHyprPayGatewayProvider({
        asaas: { apiKey: "asaas_test" },
        abacatePay: { apiKey: "abacate_test" },
      }));

      expect(Exit.isFailure(result)).toBe(true);
    }));
});
