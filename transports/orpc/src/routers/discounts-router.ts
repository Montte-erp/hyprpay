import { z } from "zod";
import type { DiscountsApi } from "@hyprpay/discounts";
import { discountInputSchema } from "@hyprpay/discounts";
import { unwrap } from "../error/billing-result-to-orpc-error";
import { billingProcedure } from "../procedure";

const discountUpdateSchema = z
  .object({
    duration: z.enum(["once", "forever", "repeating"]),
    durationInCycles: z.number().int().positive(),
    maxRedemptions: z.number().int().positive(),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    restrictedToProductIds: z.array(z.string().min(1)),
    active: z.boolean(),
    metadata: z.record(z.string(), z.string()),
  })
  .partial();

const createDiscount = billingProcedure
  .route({ method: "POST", path: "/billing/discounts" })
  .input(discountInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.discounts.create(input)));

const getDiscount = billingProcedure
  .route({ method: "GET", path: "/billing/discounts/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.discounts.get(input.params.id)),
  );

const findDiscountByCode = billingProcedure
  .route({
    method: "GET",
    path: "/billing/discounts/code/{code}",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ code: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.discounts.findByCode(input.params.code)),
  );

const listDiscounts = billingProcedure
  .route({ method: "GET", path: "/billing/discounts" })
  .input(z.object({}))
  .handler(async ({ context }) => unwrap(await context.api.discounts.list()));

const applyDiscountCode = billingProcedure
  .route({ method: "POST", path: "/billing/discounts/apply" })
  .input(
    z.object({
      code: z.string().min(1),
      amount: z.number().int().nonnegative(),
      productIds: z.array(z.string().min(1)).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    // exactOptionalPropertyTypes: omit `productIds` entirely when absent rather
    // than passing an explicit `undefined`.
    const applyInput: { code: string; amount: number; productIds?: string[] } = {
      code: input.code,
      amount: input.amount,
      ...(input.productIds !== undefined ? { productIds: input.productIds } : {}),
    };

    return unwrap(await context.api.discounts.apply(applyInput));
  });

const updateDiscount = billingProcedure
  .route({ method: "PATCH", path: "/billing/discounts/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
      body: discountUpdateSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    // Only forward keys that were actually provided to honor
    // exactOptionalPropertyTypes on the api's `DiscountUpdateInput`.
    const patch: Parameters<DiscountsApi["update"]>[1] = {
      ...(input.body.duration !== undefined ? { duration: input.body.duration } : {}),
      ...(input.body.durationInCycles !== undefined
        ? { durationInCycles: input.body.durationInCycles }
        : {}),
      ...(input.body.maxRedemptions !== undefined
        ? { maxRedemptions: input.body.maxRedemptions }
        : {}),
      ...(input.body.startsAt !== undefined ? { startsAt: input.body.startsAt } : {}),
      ...(input.body.endsAt !== undefined ? { endsAt: input.body.endsAt } : {}),
      ...(input.body.restrictedToProductIds !== undefined
        ? { restrictedToProductIds: input.body.restrictedToProductIds }
        : {}),
      ...(input.body.active !== undefined ? { active: input.body.active } : {}),
      ...(input.body.metadata !== undefined ? { metadata: input.body.metadata } : {}),
    };

    return unwrap(await context.api.discounts.update(input.params.id, patch));
  });

const deleteDiscount = billingProcedure
  .route({ method: "DELETE", path: "/billing/discounts/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.discounts.delete(input.params.id)),
  );

export const discountsRouter = {
  create: createDiscount,
  get: getDiscount,
  findByCode: findDiscountByCode,
  apply: applyDiscountCode,
  list: listDiscounts,
  update: updateDiscount,
  delete: deleteDiscount,
};
