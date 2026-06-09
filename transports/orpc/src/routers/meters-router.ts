import { z } from "zod";
import { meterEventInputSchema, meterInputSchema } from "@hyprpay/meters";
import { unwrap } from "../error/billing-result-to-orpc-error";
import { billingProcedure } from "../procedure";

// Create a meter definition (slug, name, eventName, aggregation, filters, …).
const createMeter = billingProcedure
  .route({ method: "POST", path: "/billing/meters" })
  .input(meterInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.meters.createMeter(input)));

// Ingest a usage event (idempotent on idempotencyKey).
const ingestMeterEvent = billingProcedure
  .route({ method: "POST", path: "/billing/meters/events" })
  .input(meterEventInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.meters.ingest(input)));

// List/query usage events over a period (time-bucketed quantities read).
// Detailed input structure: `{meterId}` is a path param; bounds/interval are query.
const listMeterEvents = billingProcedure
  .route({
    method: "GET",
    path: "/billing/meters/{meterId}/quantities",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ meterId: z.string().min(1) }),
      query: z.object({
        periodStart: z.string().min(1),
        periodEnd: z.string().min(1),
        interval: z.enum(["hour", "day", "week", "month"]).default("day"),
        subscriptionId: z.string().min(1).optional(),
        customerId: z.string().min(1).optional(),
      }),
    }),
  )
  .handler(async ({ context, input }) => {
    // exactOptionalPropertyTypes: omit optional keys rather than assign undefined.
    const params = {
      meterId: input.params.meterId,
      periodStart: input.query.periodStart,
      periodEnd: input.query.periodEnd,
      interval: input.query.interval,
      ...(input.query.subscriptionId !== undefined
        ? { subscriptionId: input.query.subscriptionId }
        : {}),
      ...(input.query.customerId !== undefined ? { customerId: input.query.customerId } : {}),
    };

    return unwrap(await context.api.meters.quantities(params));
  });

// Aggregate a meter over a billing period into a usage snapshot.
const aggregateMeter = billingProcedure
  .route({
    method: "POST",
    path: "/billing/meters/{meterId}/aggregate",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ meterId: z.string().min(1) }),
      body: z.object({
        subscriptionId: z.string().min(1),
        periodStart: z.string().min(1),
        periodEnd: z.string().min(1),
      }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.meters.aggregate({
        meterId: input.params.meterId,
        subscriptionId: input.body.subscriptionId,
        periodStart: input.body.periodStart,
        periodEnd: input.body.periodEnd,
      }),
    ),
  );

// Grant credit to a customer for a meter.
const grantMeterCredit = billingProcedure
  .route({
    method: "POST",
    path: "/billing/meters/{meterId}/credits",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ meterId: z.string().min(1) }),
      body: z.object({
        customerId: z.string().min(1),
        amount: z.number().positive(),
      }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.meters.grantCredit({
        meterId: input.params.meterId,
        customerId: input.body.customerId,
        amount: input.body.amount,
      }),
    ),
  );

// Read a customer's credit balance for a meter (granted/consumed/balance).
const meterBalance = billingProcedure
  .route({
    method: "GET",
    path: "/billing/meters/{meterId}/customers/{customerId}/balance",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({
        meterId: z.string().min(1),
        customerId: z.string().min(1),
      }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.meters.balance({
        meterId: input.params.meterId,
        customerId: input.params.customerId,
      }),
    ),
  );

export const metersRouter = {
  create: createMeter,
  ingest: ingestMeterEvent,
  quantities: listMeterEvents,
  aggregate: aggregateMeter,
  grantCredit: grantMeterCredit,
  balance: meterBalance,
};
