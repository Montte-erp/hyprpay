import type { BillingResult } from "../results/billing-result";
import type { Price, PriceListFilter } from "../schemas/price-schema";
import type { Product, ProductListFilter } from "../schemas/product-schema";

export interface CatalogDatabaseAdapter {
  products: {
    create(input: Product): Promise<BillingResult<Product>>;
    findById(id: string): Promise<BillingResult<Product | null>>;
    list(filter: ProductListFilter): Promise<BillingResult<Product[]>>;
    update(input: Product): Promise<BillingResult<Product>>;
  };
  prices: {
    create(input: Price): Promise<BillingResult<Price>>;
    findById(id: string): Promise<BillingResult<Price | null>>;
    list(filter: PriceListFilter): Promise<BillingResult<Price[]>>;
    update(input: Price): Promise<BillingResult<Price>>;
  };
}

export type CatalogPriceLookupAdapter = Pick<CatalogDatabaseAdapter, "prices">;
