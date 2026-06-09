import type { BillingResult } from "../results/billing-result";
import type { Price } from "../schemas/price-schema";
import type { ProviderProductInput, Product } from "../schemas/product-schema";

export interface CatalogProviderAdapter {
  id: string;
  createProduct?(input: ProviderProductInput): Promise<BillingResult<Product>>;
}

export type CatalogPriceProviderProduct = Pick<Price, "providerProductId">;
