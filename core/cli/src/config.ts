import type { ProductDefinition } from "@hyprpay/core/catalog";
import type { HyprPayPostgresDatabase } from "@hyprpay/store-postgres";

export interface HyprPayCliConfig<TCatalog extends readonly ProductDefinition[] = readonly ProductDefinition[]> {
  readonly db: HyprPayPostgresDatabase;
  readonly catalog?: TCatalog;
}

export const defineHyprPayConfig = <const TCatalog extends readonly ProductDefinition[]>(
  config: HyprPayCliConfig<TCatalog>,
): HyprPayCliConfig<TCatalog> => config;
