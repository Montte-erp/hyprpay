import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import type { CatalogDatabaseAdapter, CatalogPriceLookupAdapter } from "./contracts/catalog-database-adapter";
import type { CatalogProviderAdapter } from "./contracts/catalog-provider-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type { Price, PriceInput, PriceListFilter, PriceUpdateInput } from "./schemas/price-schema";
import { priceInputSchema, priceListFilterSchema, priceUpdateInputSchema } from "./schemas/price-schema";
import type {
  Product,
  ProductInput,
  ProductListFilter,
  ProductUpdateInput,
  ProviderProductInput,
} from "./schemas/product-schema";
import {
  productInputSchema,
  productListFilterSchema,
  productUpdateInputSchema,
} from "./schemas/product-schema";
import { billingIntervalSchema, billingStrategySchema, currencySchema, metadataSchema, priceTypeSchema } from "./schemas/shared-schema";

export interface CatalogApi {
  products: {
    create(input: ProductInput): Promise<BillingResult<Product>>;
    get(id: string): Promise<BillingResult<Product | null>>;
    list(filter?: ProductListFilter): Promise<BillingResult<Product[]>>;
    update(id: string, input: ProductUpdateInput): Promise<BillingResult<Product>>;
    archive(id: string): Promise<BillingResult<Product>>;
  };
  prices: {
    create(input: PriceInput): Promise<BillingResult<Price>>;
    get(id: string): Promise<BillingResult<Price | null>>;
    list(filter?: PriceListFilter): Promise<BillingResult<Price[]>>;
    update(id: string, input: PriceUpdateInput): Promise<BillingResult<Price>>;
    archive(id: string): Promise<BillingResult<Price>>;
  };
}

export interface CatalogPluginOptions {
  database: CatalogDatabaseAdapter;
  provider?: CatalogProviderAdapter;
}

export type CatalogPluginEvent =
  | { type: "billing.product.created"; payload: Product }
  | { type: "billing.product.updated"; payload: Product }
  | { type: "billing.product.archived"; payload: Product }
  | { type: "billing.price.created"; payload: Price }
  | { type: "billing.price.updated"; payload: Price }
  | { type: "billing.price.archived"; payload: Price };

const invalidBillingInput = <T>(message = "Dados de billing inválidos."): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.INVALID_INPUT(),
      message,
    }),
  );

const notFound = <T>(message: string): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.NOT_FOUND(),
      message,
    }),
  );

const emitCatalogEvent = async (runtime: HyprPayRuntime, event: CatalogPluginEvent) => {
  await runtime.emit(event);
};

/**
 * Validates pay-what-you-want / custom pricing constraints. For a "custom" price
 * the floor (minAmount) must not exceed the preset, and any provided defaults
 * must stay non-negative integers (already enforced by zod). For "fixed" prices
 * the custom fields are meaningless, so reject them to avoid silent misconfig.
 */
const validatePricing = (
  input: Pick<PriceInput, "priceType" | "amount" | "minAmount" | "presetAmount">,
): BillingResult<true> => {
  if (input.priceType === "custom") {
    if (
      input.minAmount !== undefined &&
      input.presetAmount !== undefined &&
      input.minAmount > input.presetAmount
    ) {
      return invalidBillingInput("O valor mínimo não pode ser maior que o valor sugerido.");
    }

    return Result.ok(true);
  }

  if (input.minAmount !== undefined || input.presetAmount !== undefined) {
    return invalidBillingInput(
      "Campos de preço customizado só são válidos quando priceType é 'custom'.",
    );
  }

  return Result.ok(true);
};

export const catalog = (options: CatalogPluginOptions): HyprPayPlugin<"catalog", CatalogApi> => ({
  id: "catalog",
  namespace: "catalog",
  extendApi: runtime => ({
    products: {
      create: async (input: ProductInput) => {
        const parsed = productInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const createdResult = await options.database.products.create({
          id: crypto.randomUUID(),
          ...parsed.data,
        });

        if (Result.isError(createdResult)) {
          return createdResult;
        }

        await emitCatalogEvent(runtime, {
          type: "billing.product.created",
          payload: createdResult.value,
        });

        return createdResult;
      },
      get: async (id: string) => options.database.products.findById(id),
      list: async (filter?: ProductListFilter) => {
        const parsed = productListFilterSchema.safeParse(filter ?? {});

        if (!parsed.success) {
          return invalidBillingInput();
        }

        return options.database.products.list(parsed.data);
      },
      update: async (id: string, input: ProductUpdateInput) => {
        const parsed = productUpdateInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const existingResult = await options.database.products.findById(id);

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound("Produto de billing não encontrado.");
        }

        const patch = parsed.data;
        const nextProduct: Product = {
          ...existingResult.value,
          ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        };

        const updatedResult = await options.database.products.update(nextProduct);

        if (Result.isError(updatedResult)) {
          return updatedResult;
        }

        await emitCatalogEvent(runtime, {
          type: "billing.product.updated",
          payload: updatedResult.value,
        });

        return updatedResult;
      },
      archive: async (id: string) => {
        const existingResult = await options.database.products.findById(id);

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound("Produto de billing não encontrado.");
        }

        const archivedProduct: Product = {
          ...existingResult.value,
          active: false,
        };

        const updatedResult = await options.database.products.update(archivedProduct);

        if (Result.isError(updatedResult)) {
          return updatedResult;
        }

        await emitCatalogEvent(runtime, {
          type: "billing.product.archived",
          payload: updatedResult.value,
        });

        return updatedResult;
      },
    },
    prices: {
      create: async (input: PriceInput) => {
        const parsed = priceInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const pricingResult = validatePricing(parsed.data);

        if (Result.isError(pricingResult)) {
          return Result.err(pricingResult.error);
        }

        const productResult = await options.database.products.findById(parsed.data.productId);

        if (Result.isError(productResult)) {
          return Result.err(productResult.error);
        }

        if (productResult.value === null) {
          return notFound("Produto de billing não encontrado.");
        }

        let providerProductId = parsed.data.providerProductId;

        if (providerProductId === undefined && options.provider?.createProduct !== undefined) {
          const providerProductInput: ProviderProductInput = {
            externalId: `${productResult.value.id}:${parsed.data.slug}`,
            name: productResult.value.name,
            description: productResult.value.description,
            amount: parsed.data.amount,
            currency: parsed.data.currency,
            interval: parsed.data.interval,
            trialDays: parsed.data.trialDays,
            metadata: {
              ...(productResult.value.metadata ?? {}),
              ...(parsed.data.metadata ?? {}),
            },
          };
          const providerProductResult = await options.provider.createProduct(providerProductInput);

          if (Result.isError(providerProductResult)) {
            return Result.err(providerProductResult.error);
          }

          providerProductId = providerProductResult.value.id;
        }

        const createdResult = await options.database.prices.create({
          id: crypto.randomUUID(),
          ...parsed.data,
          providerProductId,
        });

        if (Result.isError(createdResult)) {
          return createdResult;
        }

        await emitCatalogEvent(runtime, {
          type: "billing.price.created",
          payload: createdResult.value,
        });

        return createdResult;
      },
      get: async (id: string) => options.database.prices.findById(id),
      list: async (filter?: PriceListFilter) => {
        const parsed = priceListFilterSchema.safeParse(filter ?? {});

        if (!parsed.success) {
          return invalidBillingInput();
        }

        return options.database.prices.list(parsed.data);
      },
      update: async (id: string, input: PriceUpdateInput) => {
        const parsed = priceUpdateInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const existingResult = await options.database.prices.findById(id);

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound("Preço de billing não encontrado.");
        }

        const patch = parsed.data;
        const nextPrice: Price = {
          ...existingResult.value,
          ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
          ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
          ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
          ...(patch.interval !== undefined ? { interval: patch.interval } : {}),
          ...(patch.trialDays !== undefined ? { trialDays: patch.trialDays } : {}),
          ...(patch.usageBased !== undefined ? { usageBased: patch.usageBased } : {}),
          ...(patch.billingStrategy !== undefined ? { billingStrategy: patch.billingStrategy } : {}),
          ...(patch.priceType !== undefined ? { priceType: patch.priceType } : {}),
          ...(patch.minAmount !== undefined ? { minAmount: patch.minAmount } : {}),
          ...(patch.presetAmount !== undefined ? { presetAmount: patch.presetAmount } : {}),
          ...(patch.meterId !== undefined ? { meterId: patch.meterId } : {}),
          ...(patch.unitAmount !== undefined ? { unitAmount: patch.unitAmount } : {}),
          ...(patch.providerProductId !== undefined ? { providerProductId: patch.providerProductId } : {}),
          ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        };

        const pricingResult = validatePricing(nextPrice);

        if (Result.isError(pricingResult)) {
          return Result.err(pricingResult.error);
        }

        const updatedResult = await options.database.prices.update(nextPrice);

        if (Result.isError(updatedResult)) {
          return updatedResult;
        }

        await emitCatalogEvent(runtime, {
          type: "billing.price.updated",
          payload: updatedResult.value,
        });

        return updatedResult;
      },
      archive: async (id: string) => {
        const existingResult = await options.database.prices.findById(id);

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound("Preço de billing não encontrado.");
        }

        const archivedPrice: Price = {
          ...existingResult.value,
          active: false,
        };

        const updatedResult = await options.database.prices.update(archivedPrice);

        if (Result.isError(updatedResult)) {
          return updatedResult;
        }

        await emitCatalogEvent(runtime, {
          type: "billing.price.archived",
          payload: updatedResult.value,
        });

        return updatedResult;
      },
    },
  }),
});

export type { BillingResult, CatalogDatabaseAdapter, CatalogPriceLookupAdapter, CatalogProviderAdapter };
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export {
  priceInputSchema,
  priceListFilterSchema,
  priceSchema,
  priceUpdateInputSchema,
} from "./schemas/price-schema";
export type { Price, PriceInput, PriceListFilter, PriceUpdateInput } from "./schemas/price-schema";
export {
  productInputSchema,
  productListFilterSchema,
  productSchema,
  productUpdateInputSchema,
  providerProductInputSchema,
} from "./schemas/product-schema";
export type {
  Product,
  ProductInput,
  ProductListFilter,
  ProductUpdateInput,
  ProviderProductInput,
} from "./schemas/product-schema";
export {
  billingIntervalSchema,
  billingStrategySchema,
  currencySchema,
  metadataSchema,
  priceTypeSchema,
} from "./schemas/shared-schema";
