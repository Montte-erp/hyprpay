import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import { prorate } from "@hyprpay/money";
import type { SeatsDatabaseAdapter, SeatsLookupAdapter } from "./contracts/seats-database-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import {
  billableSeatsFor,
  effectiveUnitAmount,
  seatChargeAmount,
} from "./pricing/seat-pricing";
import type { BillingResult } from "./results/billing-result";
import type {
  SeatAssignInput,
  SeatAssignment,
  SeatChargeLine,
  SeatClaimInput,
  SeatInvitation,
  SeatInviteInput,
  SeatPlan,
  SeatPlanInput,
} from "./schemas/seat-schema";
import {
  seatAssignInputSchema,
  seatAssignmentSchema,
  seatAssignmentStatusSchema,
  seatChargeLineSchema,
  seatClaimInputSchema,
  seatInvitationSchema,
  seatInvitationStatusSchema,
  seatInviteInputSchema,
  seatPlanInputSchema,
  seatPlanSchema,
  seatPricingModeSchema,
  seatPricingTierSchema,
} from "./schemas/seat-schema";
import { currencySchema, metadataSchema } from "./schemas/shared-schema";

/** Result of pricing the billable seats of a subscription for a billing window. */
export interface SeatQuote {
  seats: number;
  billableSeats: number;
  unitAmount: number;
  amount: number;
  /** Prorated charge when a `changeAt`/period window is supplied, else equal to `amount`. */
  proratedAmount: number;
}

export interface SeatsApi {
  createPlan(input: SeatPlanInput): Promise<BillingResult<SeatPlan>>;
  assign(input: SeatAssignInput): Promise<BillingResult<SeatAssignment>>;
  invite(input: SeatInviteInput): Promise<BillingResult<SeatInvitation>>;
  claim(input: SeatClaimInput): Promise<BillingResult<SeatAssignment>>;
  revoke(input: { assignmentId: string }): Promise<BillingResult<SeatAssignment>>;
  count(subscriptionId: string): Promise<BillingResult<number>>;
  quote(input: {
    subscriptionId: string;
    planId: string;
    periodStart?: string;
    periodEnd?: string;
    changeAt?: string;
  }): Promise<BillingResult<SeatQuote>>;
  /**
   * Create a billable charge line for the active seats of a subscription. When
   * a period window + `changeAt` are supplied the amount is prorated for the
   * remaining portion of the cycle (used when seat count scales mid-cycle).
   */
  charge(input: {
    subscriptionId: string;
    planId: string;
    periodStart?: string;
    periodEnd?: string;
    changeAt?: string;
  }): Promise<BillingResult<SeatChargeLine>>;
}

export interface SeatsPluginOptions {
  database: SeatsDatabaseAdapter;
}

export type SeatPluginEvent =
  | { type: "billing.seat.assigned"; payload: SeatAssignment }
  | { type: "billing.seat.revoked"; payload: SeatAssignment }
  | { type: "billing.seat.invited"; payload: SeatInvitation }
  | { type: "billing.seat.claimed"; payload: SeatAssignment }
  | { type: "billing.seat.charged"; payload: SeatChargeLine };

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

const emitSeatEvent = async (runtime: HyprPayRuntime, event: SeatPluginEvent) => {
  await runtime.emit(event);
};

/**
 * Build a `SeatQuote` for a plan + active seat count, applying tiered/volume
 * pricing and proration when a `changeAt`/period window is supplied. Prorating
 * an invalid date window degrades gracefully to the full amount.
 */
const priceSeats = (
  plan: SeatPlan,
  activeSeats: number,
  window: { periodStart?: string; periodEnd?: string; changeAt?: string },
): SeatQuote => {
  const billableSeats = billableSeatsFor(plan, activeSeats);
  const amount = seatChargeAmount(plan, billableSeats);
  const unitAmount = effectiveUnitAmount(plan, billableSeats);

  let proratedAmount = amount;
  if (
    window.periodStart !== undefined &&
    window.periodEnd !== undefined &&
    window.changeAt !== undefined &&
    amount > 0
  ) {
    try {
      proratedAmount = prorate({
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        changeAt: window.changeAt,
        amount,
      });
    } catch {
      // Invalid/degenerate window — fall back to the full amount rather than
      // surfacing an arithmetic error to the caller.
      proratedAmount = amount;
    }
  }

  return { seats: activeSeats, billableSeats, unitAmount, amount, proratedAmount };
};

export const seats = (options: SeatsPluginOptions): HyprPayPlugin<"seats", SeatsApi> => ({
  id: "seats",
  namespace: "seats",
  extendApi: runtime => ({
    createPlan: async (input: SeatPlanInput) => {
      const parsed = seatPlanInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      // Guard incoherent tiered/volume configs: those modes require tiers.
      if (parsed.data.pricingMode !== "flat" && (parsed.data.tiers ?? []).length === 0) {
        return invalidBillingInput(
          "Planos com cobrança por faixa exigem ao menos uma faixa de preço.",
        );
      }

      const seatPlan: SeatPlan = {
        id: crypto.randomUUID(),
        ...parsed.data,
        createdAt: new Date().toISOString(),
      };

      return options.database.seatPlans.create(seatPlan);
    },
    assign: async (input: SeatAssignInput) => {
      const parsed = seatAssignInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const existingResult = await options.database.assignments.findActiveByMember({
        subscriptionId: parsed.data.subscriptionId,
        memberId: parsed.data.memberId,
      });

      if (Result.isError(existingResult)) {
        return Result.err(existingResult.error);
      }

      if (existingResult.value !== null) {
        return Result.ok(existingResult.value);
      }

      const assignment: SeatAssignment = {
        id: crypto.randomUUID(),
        subscriptionId: parsed.data.subscriptionId,
        memberId: parsed.data.memberId,
        ...(parsed.data.memberEmail !== undefined
          ? { memberEmail: parsed.data.memberEmail }
          : {}),
        status: "active",
        assignedAt: new Date().toISOString(),
      };

      const createdResult = await options.database.assignments.create(assignment);

      if (Result.isError(createdResult)) {
        return Result.err(createdResult.error);
      }

      await emitSeatEvent(runtime, {
        type: "billing.seat.assigned",
        payload: createdResult.value,
      });

      return createdResult;
    },
    invite: async (input: SeatInviteInput) => {
      const parsed = seatInviteInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      // Idempotent: an existing pending invite for the same (sub, email) is reused.
      const pendingResult = await options.database.invitations.findPendingByEmail({
        subscriptionId: parsed.data.subscriptionId,
        memberEmail: parsed.data.memberEmail,
      });

      if (Result.isError(pendingResult)) {
        return Result.err(pendingResult.error);
      }

      if (pendingResult.value !== null) {
        return Result.ok(pendingResult.value);
      }

      const invitation: SeatInvitation = {
        id: crypto.randomUUID(),
        subscriptionId: parsed.data.subscriptionId,
        memberEmail: parsed.data.memberEmail,
        token: crypto.randomUUID(),
        ...(parsed.data.invitedBy !== undefined ? { invitedBy: parsed.data.invitedBy } : {}),
        status: "pending",
        invitedAt: new Date().toISOString(),
        ...(parsed.data.metadata !== undefined ? { metadata: parsed.data.metadata } : {}),
      };

      const createdResult = await options.database.invitations.create(invitation);

      if (Result.isError(createdResult)) {
        return Result.err(createdResult.error);
      }

      await emitSeatEvent(runtime, {
        type: "billing.seat.invited",
        payload: createdResult.value,
      });

      return createdResult;
    },
    claim: async (input: SeatClaimInput) => {
      const parsed = seatClaimInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const inviteResult = await options.database.invitations.findByToken(parsed.data.token);

      if (Result.isError(inviteResult)) {
        return Result.err(inviteResult.error);
      }

      if (inviteResult.value === null) {
        return notFound("Convite de assento não encontrado.");
      }

      if (inviteResult.value.status !== "pending") {
        return invalidBillingInput("Este convite de assento não está mais pendente.");
      }

      const invitation = inviteResult.value;

      // Idempotent assign: reuse an existing active seat for this member.
      const existingResult = await options.database.assignments.findActiveByMember({
        subscriptionId: invitation.subscriptionId,
        memberId: parsed.data.memberId,
      });

      if (Result.isError(existingResult)) {
        return Result.err(existingResult.error);
      }

      let assignment: SeatAssignment;
      if (existingResult.value !== null) {
        assignment = existingResult.value;
      } else {
        const created = await options.database.assignments.create({
          id: crypto.randomUUID(),
          subscriptionId: invitation.subscriptionId,
          memberId: parsed.data.memberId,
          memberEmail: invitation.memberEmail,
          status: "active",
          assignedAt: new Date().toISOString(),
        });

        if (Result.isError(created)) {
          return Result.err(created.error);
        }

        assignment = created.value;

        await emitSeatEvent(runtime, {
          type: "billing.seat.assigned",
          payload: assignment,
        });
      }

      const claimedInvitation: SeatInvitation = {
        ...invitation,
        status: "claimed",
        claimedAt: new Date().toISOString(),
      };

      const updatedInvite = await options.database.invitations.update(claimedInvitation);

      if (Result.isError(updatedInvite)) {
        return Result.err(updatedInvite.error);
      }

      await emitSeatEvent(runtime, {
        type: "billing.seat.claimed",
        payload: assignment,
      });

      return Result.ok(assignment);
    },
    revoke: async (input: { assignmentId: string }) => {
      if (typeof input.assignmentId !== "string" || input.assignmentId.length === 0) {
        return invalidBillingInput();
      }

      const existingResult = await options.database.assignments.findById(input.assignmentId);

      if (Result.isError(existingResult)) {
        return Result.err(existingResult.error);
      }

      if (existingResult.value === null) {
        return notFound("Atribuição de assento não encontrada.");
      }

      const revoked: SeatAssignment = {
        ...existingResult.value,
        status: "revoked",
        revokedAt: new Date().toISOString(),
      };

      const updatedResult = await options.database.assignments.update(revoked);

      if (Result.isError(updatedResult)) {
        return Result.err(updatedResult.error);
      }

      await emitSeatEvent(runtime, {
        type: "billing.seat.revoked",
        payload: updatedResult.value,
      });

      return updatedResult;
    },
    count: async (subscriptionId: string) => {
      if (typeof subscriptionId !== "string" || subscriptionId.length === 0) {
        return invalidBillingInput();
      }

      const activeResult = await options.database.assignments.listActive(subscriptionId);

      if (Result.isError(activeResult)) {
        return Result.err(activeResult.error);
      }

      return Result.ok(activeResult.value.length);
    },
    quote: async input => {
      const planResult = await options.database.seatPlans.findById(input.planId);

      if (Result.isError(planResult)) {
        return Result.err(planResult.error);
      }

      if (planResult.value === null) {
        return notFound("Plano de assentos não encontrado.");
      }

      const activeResult = await options.database.assignments.listActive(input.subscriptionId);

      if (Result.isError(activeResult)) {
        return Result.err(activeResult.error);
      }

      const quote = priceSeats(planResult.value, activeResult.value.length, {
        ...(input.periodStart !== undefined ? { periodStart: input.periodStart } : {}),
        ...(input.periodEnd !== undefined ? { periodEnd: input.periodEnd } : {}),
        ...(input.changeAt !== undefined ? { changeAt: input.changeAt } : {}),
      });

      return Result.ok(quote);
    },
    charge: async input => {
      const planResult = await options.database.seatPlans.findById(input.planId);

      if (Result.isError(planResult)) {
        return Result.err(planResult.error);
      }

      if (planResult.value === null) {
        return notFound("Plano de assentos não encontrado.");
      }

      const plan = planResult.value;

      const activeResult = await options.database.assignments.listActive(input.subscriptionId);

      if (Result.isError(activeResult)) {
        return Result.err(activeResult.error);
      }

      const isProrated =
        input.periodStart !== undefined &&
        input.periodEnd !== undefined &&
        input.changeAt !== undefined;

      const quote = priceSeats(plan, activeResult.value.length, {
        ...(input.periodStart !== undefined ? { periodStart: input.periodStart } : {}),
        ...(input.periodEnd !== undefined ? { periodEnd: input.periodEnd } : {}),
        ...(input.changeAt !== undefined ? { changeAt: input.changeAt } : {}),
      });

      const amount = isProrated ? quote.proratedAmount : quote.amount;

      const chargeLine: SeatChargeLine = {
        id: crypto.randomUUID(),
        subscriptionId: input.subscriptionId,
        planId: plan.id,
        label: isProrated
          ? `Assentos cobrados (${quote.billableSeats}, proporcional)`
          : `Assentos cobrados (${quote.billableSeats})`,
        currency: "BRL",
        seats: quote.seats,
        billableSeats: quote.billableSeats,
        unitAmount: quote.unitAmount,
        amount,
        ...(isProrated ? { proratedFromSeats: quote.billableSeats } : {}),
        createdAt: new Date().toISOString(),
      };

      const createdResult = await options.database.charges.create(chargeLine);

      if (Result.isError(createdResult)) {
        return Result.err(createdResult.error);
      }

      await emitSeatEvent(runtime, {
        type: "billing.seat.charged",
        payload: createdResult.value,
      });

      return createdResult;
    },
  }),
});

export type { BillingResult, SeatsDatabaseAdapter, SeatsLookupAdapter };
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export {
  seatAssignInputSchema,
  seatAssignmentSchema,
  seatAssignmentStatusSchema,
  seatChargeLineSchema,
  seatClaimInputSchema,
  seatInvitationSchema,
  seatInvitationStatusSchema,
  seatInviteInputSchema,
  seatPlanInputSchema,
  seatPlanSchema,
  seatPricingModeSchema,
  seatPricingTierSchema,
};
export type {
  SeatAssignInput,
  SeatAssignment,
  SeatChargeLine,
  SeatClaimInput,
  SeatInvitation,
  SeatInviteInput,
  SeatPlan,
  SeatPlanInput,
} from "./schemas/seat-schema";
export { currencySchema, metadataSchema };
