import { z } from "zod";
import { seatAssignInputSchema, seatPlanInputSchema } from "@hyprpay/seats";
import { unwrap } from "../error/billing-result-to-orpc-error";
import { billingProcedure } from "../procedure";

const createPlan = billingProcedure
  .route({ method: "POST", path: "/billing/seats/plans" })
  .input(seatPlanInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.seats.createPlan(input)));

const assignSeat = billingProcedure
  .route({ method: "POST", path: "/billing/seats/assignments" })
  .input(seatAssignInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.seats.assign(input)));

const inviteSeat = billingProcedure
  .route({ method: "POST", path: "/billing/seats/invitations" })
  .input(
    z.object({
      subscriptionId: z.string().min(1),
      memberEmail: z.string().email(),
      invitedBy: z.string().min(1).optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    // exactOptionalPropertyTypes: never assign an explicit undefined.
    const payload: {
      subscriptionId: string;
      memberEmail: string;
      invitedBy?: string;
      metadata?: Record<string, string>;
    } = {
      subscriptionId: input.subscriptionId,
      memberEmail: input.memberEmail,
      ...(input.invitedBy !== undefined ? { invitedBy: input.invitedBy } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    return unwrap(await context.api.seats.invite(payload));
  });

const claimSeat = billingProcedure
  .route({ method: "POST", path: "/billing/seats/claims" })
  .input(
    z.object({
      token: z.string().min(1),
      memberId: z.string().min(1),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const payload: { token: string; memberId: string; metadata?: Record<string, string> } = {
      token: input.token,
      memberId: input.memberId,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    return unwrap(await context.api.seats.claim(payload));
  });

const revokeSeat = billingProcedure
  .route({
    method: "POST",
    path: "/billing/seats/assignments/{assignmentId}/revoke",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ assignmentId: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.seats.revoke({ assignmentId: input.params.assignmentId })),
  );

const countSeats = billingProcedure
  .route({
    method: "GET",
    path: "/billing/seats/subscriptions/{subscriptionId}/count",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ subscriptionId: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.seats.count(input.params.subscriptionId)),
  );

const quoteSeats = billingProcedure
  .route({
    method: "GET",
    path: "/billing/seats/subscriptions/{subscriptionId}/quote",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ subscriptionId: z.string().min(1) }),
      query: z.object({
        planId: z.string().min(1),
        periodStart: z.string().min(1).optional(),
        periodEnd: z.string().min(1).optional(),
        changeAt: z.string().min(1).optional(),
      }),
    }),
  )
  .handler(async ({ context, input }) => {
    const payload: {
      subscriptionId: string;
      planId: string;
      periodStart?: string;
      periodEnd?: string;
      changeAt?: string;
    } = {
      subscriptionId: input.params.subscriptionId,
      planId: input.query.planId,
      ...(input.query.periodStart !== undefined ? { periodStart: input.query.periodStart } : {}),
      ...(input.query.periodEnd !== undefined ? { periodEnd: input.query.periodEnd } : {}),
      ...(input.query.changeAt !== undefined ? { changeAt: input.query.changeAt } : {}),
    };

    return unwrap(await context.api.seats.quote(payload));
  });

const chargeSeats = billingProcedure
  .route({
    method: "POST",
    path: "/billing/seats/subscriptions/{subscriptionId}/charges",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ subscriptionId: z.string().min(1) }),
      body: z.object({
        planId: z.string().min(1),
        periodStart: z.string().min(1).optional(),
        periodEnd: z.string().min(1).optional(),
        changeAt: z.string().min(1).optional(),
      }),
    }),
  )
  .handler(async ({ context, input }) => {
    const payload: {
      subscriptionId: string;
      planId: string;
      periodStart?: string;
      periodEnd?: string;
      changeAt?: string;
    } = {
      subscriptionId: input.params.subscriptionId,
      planId: input.body.planId,
      ...(input.body.periodStart !== undefined ? { periodStart: input.body.periodStart } : {}),
      ...(input.body.periodEnd !== undefined ? { periodEnd: input.body.periodEnd } : {}),
      ...(input.body.changeAt !== undefined ? { changeAt: input.body.changeAt } : {}),
    };

    return unwrap(await context.api.seats.charge(payload));
  });

export const seatsRouter = {
  createPlan,
  assign: assignSeat,
  invite: inviteSeat,
  claim: claimSeat,
  revoke: revokeSeat,
  count: countSeats,
  quote: quoteSeats,
  charge: chargeSeats,
};
