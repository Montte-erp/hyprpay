import type { Product } from "../../billing-plugin"
import type { billingProducts } from "../tables/billing-products.table";

export interface BillingProductRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  metadata: Record<string, string>;
  active: boolean;
}

export const mapProductRecord = (record: BillingProductRecord): Product => ({
  id: record.id,
  slug: record.slug,
  name: record.name,
  description: record.description ?? undefined,
  metadata: record.metadata,
  active: record.active,
});
