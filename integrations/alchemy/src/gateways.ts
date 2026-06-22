import { Effect } from "effect";
import type { PaymentProviderAdapter } from "@hyprpay/core";
import { invalidInput, type HyprPayError } from "@hyprpay/core/errors";
import { createAbacatePayProvider, type CreateAbacatePayProviderOptions } from "@hyprpay/gateway-abacate-pay";
import { createAsaasProvider, type CreateAsaasProviderOptions } from "@hyprpay/gateway-asaas";

export interface HyprPayAsaasGatewayConfig extends CreateAsaasProviderOptions {
  readonly enabled?: boolean;
}

export interface HyprPayAbacatePayGatewayConfig extends CreateAbacatePayProviderOptions {
  readonly enabled?: boolean;
}

export interface HyprPayAlchemyGateways {
  readonly asaas?: HyprPayAsaasGatewayConfig | null;
  readonly abacatePay?: HyprPayAbacatePayGatewayConfig | null;
}

const enabled = (value?: { readonly enabled?: boolean } | null) => value !== undefined && value !== null && value.enabled !== false;

export const createHyprPayGatewayProvider = (
  gateways: HyprPayAlchemyGateways,
): Effect.Effect<PaymentProviderAdapter | undefined, HyprPayError> => {
  const asaasEnabled = enabled(gateways.asaas);
  const abacatePayEnabled = enabled(gateways.abacatePay);

  if (asaasEnabled && abacatePayEnabled) {
    return Effect.fail(invalidInput());
  }

  if (asaasEnabled && gateways.asaas !== undefined && gateways.asaas !== null) {
    return Effect.succeed(createAsaasProvider(gateways.asaas));
  }

  if (abacatePayEnabled && gateways.abacatePay !== undefined && gateways.abacatePay !== null) {
    return Effect.succeed(createAbacatePayProvider(gateways.abacatePay));
  }

  return Effect.succeed(undefined);
};
