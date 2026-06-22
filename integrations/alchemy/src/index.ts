import { Stack, inMemoryState, type StackProps, type StackServices } from "alchemy";
import type { ConfigError } from "effect/Config";
import type { Effect } from "effect";
import { createHyprPayGatewayProvider } from "./gateways";

export type {
  HyprPayAbacatePayGatewayConfig,
  HyprPayAlchemyGateways,
  HyprPayAsaasGatewayConfig,
} from "./gateways";
export { createHyprPayGatewayProvider };

export interface DefineHyprPayStackOptions<Req> {
  readonly name: string;
  readonly providers: StackProps<Req>["providers"];
  readonly state?: StackProps<Req>["state"];
}

export const defineHyprPayStack = <A, Req>(
  options: DefineHyprPayStackOptions<Req>,
  program: Effect.Effect<A, ConfigError, Req | StackServices>,
) => Stack(options.name, {
  providers: options.providers,
  state: options.state ?? inMemoryState(),
}, program);
