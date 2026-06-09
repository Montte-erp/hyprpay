import { z } from "zod";
import {
  listSubscriptionsFilterSchema,
  subscriptionInputSchema,
  subscriptionStatusSchema,
} from "@hyprpay/subscriptions";
import { unwrap } from "../error/billing-result-to-orpc-error";
import { billingProcedure } from "../procedure";

const createSubscription = billingProcedure
  .route({ method: "POST", path: "/billing/subscriptions" })
  .input(subscriptionInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.subscriptions.create(input)));

const getSubscription = billingProcedure
  .route({ method: "GET", path: "/billing/subscriptions/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.subscriptions.get(input.params.id)),
  );

const listSubscriptions = billingProcedure
  .route({ method: "GET", path: "/billing/subscriptions", inputStructure: "detailed" })
  .input(
    z.object({
      query: z.object({
        customerId: z.string().min(1).optional(),
        status: subscriptionStatusSchema.optional(),
        priceId: z.string().min(1).optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
        offset: z.coerce.number().int().nonnegative().optional(),
      }),
    }),
  )
  .handler(async ({ context, input }) => {
    // exactOptionalPropertyTypes: build the filter without assigning explicit undefined.
    const filter = listSubscriptionsFilterSchema.parse({
      ...(input.query.customerId !== undefined ? { customerId: input.query.customerId } : {}),
      ...(input.query.status !== undefined ? { status: input.query.status } : {}),
      ...(input.query.priceId !== undefined ? { priceId: input.query.priceId } : {}),
      ...(input.query.limit !== undefined ? { limit: input.query.limit } : {}),
      ...(input.query.offset !== undefined ? { offset: input.query.offset } : {}),
    });

    return unwrap(await context.api.subscriptions.list(filter));
  });

const updateSubscription = billingProcedure
  .route({ method: "PATCH", path: "/billing/subscriptions/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
      body: z.object({
        priceId: z.string().min(1).optional(),
        prorationBehavior: z.enum(["prorate", "none", "next_period"]).optional(),
        discountId: z.string().min(1).optional(),
        discountCode: z.string().min(1).optional(),
        metadata: z.record(z.string(), z.string()).optional(),
      }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.subscriptions.update({
        subscriptionId: input.params.id,
        // prorationBehavior carries a schema-level default ("prorate"); supply it
        // explicitly so the required API field is always present.
        prorationBehavior: input.body.prorationBehavior ?? "prorate",
        ...(input.body.priceId !== undefined ? { priceId: input.body.priceId } : {}),
        ...(input.body.discountId !== undefined ? { discountId: input.body.discountId } : {}),
        ...(input.body.discountCode !== undefined
          ? { discountCode: input.body.discountCode }
          : {}),
        ...(input.body.metadata !== undefined ? { metadata: input.body.metadata } : {}),
      }),
    ),
  );

// Detailed input structure: `{subscriptionId}` is a path param, not a body field.
const cancelSubscription = billingProcedure
  .route({
    method: "POST",
    path: "/billing/subscriptions/{subscriptionId}/cancel",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ subscriptionId: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.subscriptions.cancel({ subscriptionId: input.params.subscriptionId })),
  );

const uncancelSubscription = billingProcedure
  .route({
    method: "POST",
    path: "/billing/subscriptions/{subscriptionId}/uncancel",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ subscriptionId: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.subscriptions.uncancel({ subscriptionId: input.params.subscriptionId }),
    ),
  );

const markPaymentFailed = billingProcedure
  .route({
    method: "POST",
    path: "/billing/subscriptions/{subscriptionId}/payment-failed",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ subscriptionId: z.string().min(1) }),
      body: z
        .object({
          failedAt: z.string().min(1).optional(),
          reason: z.string().min(1).optional(),
        })
        .optional(),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.subscriptions.markPaymentFailed({
        subscriptionId: input.params.subscriptionId,
        ...(input.body?.failedAt !== undefined ? { failedAt: input.body.failedAt } : {}),
        ...(input.body?.reason !== undefined ? { reason: input.body.reason } : {}),
      }),
    ),
  );

const retryDunning = billingProcedure
  .route({
    method: "POST",
    path: "/billing/subscriptions/{subscriptionId}/dunning/retry",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ subscriptionId: z.string().min(1) }),
      body: z
        .object({
          succeeded: z.boolean().optional(),
          attemptedAt: z.string().min(1).optional(),
        })
        .optional(),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.subscriptions.retry({
        subscriptionId: input.params.subscriptionId,
        succeeded: input.body?.succeeded ?? false,
        ...(input.body?.attemptedAt !== undefined ? { attemptedAt: input.body.attemptedAt } : {}),
      }),
    ),
  );

const recordUsage = billingProcedure
  .route({
    method: "POST",
    path: "/billing/subscriptions/{subscriptionId}/usage",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ subscriptionId: z.string().min(1) }),
      body: z.object({
        productId: z.string().min(1),
        units: z.number().int().positive(),
        action: z.enum(["add", "subtract"]),
      }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.subscriptions.recordUsage({
        subscriptionId: input.params.subscriptionId,
        productId: input.body.productId,
        units: input.body.units,
        action: input.body.action,
      }),
    ),
  );

export const subscriptionsRouter = {
  create: createSubscription,
  get: getSubscription,
  list: listSubscriptions,
  update: updateSubscription,
  cancel: cancelSubscription,
  uncancel: uncancelSubscription,
  markPaymentFailed,
  retry: retryDunning,
  recordUsage,
};
