import { z } from "zod";
import {
  priceInputSchema,
  priceListFilterSchema,
  priceUpdateInputSchema,
  productInputSchema,
  productListFilterSchema,
  productUpdateInputSchema,
} from "@hyprpay/catalog";
import { unwrap } from "../error/billing-result-to-orpc-error";
import { billingProcedure } from "../procedure";

const createProduct = billingProcedure
  .route({ method: "POST", path: "/billing/catalog/products" })
  .input(productInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.catalog.products.create(input)));

const getProduct = billingProcedure
  .route({ method: "GET", path: "/billing/catalog/products/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.catalog.products.get(input.params.id)),
  );

const listProducts = billingProcedure
  .route({ method: "GET", path: "/billing/catalog/products", inputStructure: "detailed" })
  .input(
    z.object({
      query: productListFilterSchema,
    }),
  )
  .handler(async ({ context, input }) => unwrap(await context.api.catalog.products.list(input.query)));

const updateProduct = billingProcedure
  .route({ method: "PATCH", path: "/billing/catalog/products/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
      body: productUpdateInputSchema,
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.catalog.products.update(input.params.id, input.body)),
  );

const archiveProduct = billingProcedure
  .route({ method: "DELETE", path: "/billing/catalog/products/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.catalog.products.archive(input.params.id)),
  );

const createPrice = billingProcedure
  .route({ method: "POST", path: "/billing/catalog/prices" })
  .input(priceInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.catalog.prices.create(input)));

const getPrice = billingProcedure
  .route({ method: "GET", path: "/billing/catalog/prices/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.catalog.prices.get(input.params.id)),
  );

const listPrices = billingProcedure
  .route({ method: "GET", path: "/billing/catalog/prices", inputStructure: "detailed" })
  .input(
    z.object({
      query: priceListFilterSchema,
    }),
  )
  .handler(async ({ context, input }) => unwrap(await context.api.catalog.prices.list(input.query)));

const updatePrice = billingProcedure
  .route({ method: "PATCH", path: "/billing/catalog/prices/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
      body: priceUpdateInputSchema,
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.catalog.prices.update(input.params.id, input.body)),
  );

const archivePrice = billingProcedure
  .route({ method: "DELETE", path: "/billing/catalog/prices/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.catalog.prices.archive(input.params.id)),
  );

export const catalogRouter = {
  products: {
    create: createProduct,
    get: getProduct,
    list: listProducts,
    update: updateProduct,
    archive: archiveProduct,
  },
  prices: {
    create: createPrice,
    get: getPrice,
    list: listPrices,
    update: updatePrice,
    archive: archivePrice,
  },
};
