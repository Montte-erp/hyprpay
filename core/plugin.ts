import type { PaymentProviderAdapter } from "./adapter";
import type { ProductDefinition } from "./catalog";
import type { BillingEvent } from "./schemas";
import type { BillingEffect, HyprPayStore } from "./store";
import type { HyprPayTelemetry } from "./telemetry";

export interface HyprPayEvents {
  emit(event: BillingEvent | { readonly type: string; readonly payload: unknown }): BillingEffect<void>;
}

export interface HyprPayPortalOptions {
  readonly baseUrl?: string;
  readonly sessionTtlSeconds?: number;
}

export interface CreateHyprPayOptions<TCatalog extends readonly ProductDefinition[] = readonly ProductDefinition[]> {
  readonly catalog?: TCatalog;
  readonly store: HyprPayStore;
  readonly provider?: PaymentProviderAdapter;
  readonly events?: HyprPayEvents;
  readonly telemetry?: HyprPayTelemetry;
  readonly portal?: HyprPayPortalOptions;
}

export interface HyprPayPlugin<TApi, TCatalog extends readonly ProductDefinition[] = readonly ProductDefinition[]> {
  readonly id: string;
  build(options: CreateHyprPayOptions<TCatalog>): TApi;
}

export const defineHyprPayPlugin = <TApi, const TCatalog extends readonly ProductDefinition[] = readonly ProductDefinition[]>(
  plugin: HyprPayPlugin<TApi, TCatalog>,
): HyprPayPlugin<TApi, TCatalog> => plugin;
