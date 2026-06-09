import { z } from "zod";
import { checkoutInputSchema } from "@hyprpay/checkouts";
import { unwrap } from "../error/billing-result-to-orpc-error";
import { billingProcedure } from "../procedure";

const createCheckout = billingProcedure
  .route({ method: "POST", path: "/billing/checkouts" })
  .input(checkoutInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.checkouts.create(input)));

const getCheckout = billingProcedure
  .route({ method: "GET", path: "/billing/checkouts/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) => unwrap(await context.api.checkouts.get(input.params.id)));

const listCheckouts = billingProcedure
  .route({ method: "GET", path: "/billing/checkouts", inputStructure: "detailed" })
  .input(
    z.object({
      query: z.object({
        customerId: z.string().min(1).optional(),
        subscriptionId: z.string().min(1).optional(),
      }),
    }),
  )
  .handler(async ({ context, input }) => {
    // exactOptionalPropertyTypes: build the filter without assigning explicit undefined.
    const filter: { customerId?: string; subscriptionId?: string } = {
      ...(input.query.customerId !== undefined ? { customerId: input.query.customerId } : {}),
      ...(input.query.subscriptionId !== undefined
        ? { subscriptionId: input.query.subscriptionId }
        : {}),
    };

    return unwrap(await context.api.checkouts.list(filter));
  });

export const checkoutsRouter = {
  create: createCheckout,
  get: getCheckout,
  list: listCheckouts,
};
