import { z } from "zod";
import { refundInputSchema, refundTransitionInputSchema } from "@hyprpay/refunds";
import { unwrap } from "../error/billing-result-to-orpc-error";
import { billingProcedure } from "../procedure";

const createRefund = billingProcedure
  .route({ method: "POST", path: "/billing/refunds" })
  .input(refundInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.refunds.create(input)));

const getRefund = billingProcedure
  .route({ method: "GET", path: "/billing/refunds/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) => unwrap(await context.api.refunds.get(input.params.id)));

const transitionRefund = billingProcedure
  .route({ method: "POST", path: "/billing/refunds/{id}/transition", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
      body: refundTransitionInputSchema.omit({ id: true }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.refunds.transition({
        id: input.params.id,
        ...input.body,
      }),
    ),
  );

const listRefundsByOrder = billingProcedure
  .route({
    method: "GET",
    path: "/billing/orders/{orderId}/refunds",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ orderId: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.refunds.listByOrder(input.params.orderId)),
  );

const listRefundsByCustomer = billingProcedure
  .route({
    method: "GET",
    path: "/billing/customers/{customerId}/refunds",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ customerId: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.refunds.listByCustomer(input.params.customerId)),
  );

const listRefundsBySubscription = billingProcedure
  .route({
    method: "GET",
    path: "/billing/subscriptions/{subscriptionId}/refunds",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ subscriptionId: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.refunds.listBySubscription(input.params.subscriptionId)),
  );

const listRefunds = billingProcedure
  .route({ method: "GET", path: "/billing/refunds", inputStructure: "detailed" })
  .input(
    z.object({
      query: z.object({
        orderId: z.string().min(1).optional(),
        customerId: z.string().min(1).optional(),
        subscriptionId: z.string().min(1).optional(),
        status: z.enum(["pending", "succeeded", "failed", "canceled"]).optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        cursor: z.string().min(1).optional(),
      }),
    }),
  )
  .handler(async ({ context, input }) => {
    // exactOptionalPropertyTypes: build the filter without assigning explicit undefined.
    const filter: {
      orderId?: string;
      customerId?: string;
      subscriptionId?: string;
      status?: "pending" | "succeeded" | "failed" | "canceled";
      limit?: number;
      cursor?: string;
    } = {
      ...(input.query.orderId !== undefined ? { orderId: input.query.orderId } : {}),
      ...(input.query.customerId !== undefined ? { customerId: input.query.customerId } : {}),
      ...(input.query.subscriptionId !== undefined
        ? { subscriptionId: input.query.subscriptionId }
        : {}),
      ...(input.query.status !== undefined ? { status: input.query.status } : {}),
      ...(input.query.limit !== undefined ? { limit: input.query.limit } : {}),
      ...(input.query.cursor !== undefined ? { cursor: input.query.cursor } : {}),
    };

    return unwrap(await context.api.refunds.list(filter));
  });

export const refundsRouter = {
  create: createRefund,
  get: getRefund,
  transition: transitionRefund,
  listByOrder: listRefundsByOrder,
  listByCustomer: listRefundsByCustomer,
  listBySubscription: listRefundsBySubscription,
  list: listRefunds,
};
