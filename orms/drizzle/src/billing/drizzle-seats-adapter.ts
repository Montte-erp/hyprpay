import { and, eq } from "drizzle-orm";
import { Result } from "better-result";
import type {
  BillingResult,
  SeatAssignment,
  SeatChargeLine,
  SeatInvitation,
  SeatPlan,
  SeatsDatabaseAdapter,
} from "../seats-plugin";
import {
  BillingError,
  billingErrors,
  seatAssignmentSchema,
  seatChargeLineSchema,
  seatInvitationSchema,
  seatPlanSchema,
} from "../seats-plugin";
import type { BillingPgDatabase } from "./drizzle-adapter";
import { billingSchema } from "./billing-schema";
import { drizzleQueryError } from "./errors/drizzle-errors";
import {
  billingSeatAssignmentDbInsertSchema,
  billingSeatPlanDbInsertSchema,
} from "./zod/seat-schemas";

export interface DrizzleSeatsAdapterOptions {
  schema?: typeof billingSchema;
}

const firstRow = <TRow>(rows: TRow[]) => rows[0] ?? null;

const invalidStoredRecord = <T>(message: string): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.DATABASE_REQUEST_FAILED(),
      message,
    }),
  );

const runQuery = <TRow>(message: string, execute: () => Promise<TRow>) =>
  Result.tryPromise({
    try: execute,
    catch: () => drizzleQueryError(message),
  });

type SeatPlanRow = typeof billingSchema.billingSeatPlans.$inferSelect;
type SeatAssignmentRow = typeof billingSchema.billingSeatAssignments.$inferSelect;

const mapSeatPlan = (record: SeatPlanRow): SeatPlan | null => {
  const parsed = seatPlanSchema.safeParse({
    id: record.id,
    priceId: record.priceId,
    includedSeats: record.includedSeats,
    perSeatAmount: record.perSeatAmount,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const mapSeatAssignment = (record: SeatAssignmentRow): SeatAssignment | null => {
  const parsed = seatAssignmentSchema.safeParse({
    id: record.id,
    subscriptionId: record.subscriptionId,
    memberId: record.memberId,
    status: record.status,
    assignedAt: record.assignedAt,
    ...(record.memberEmail !== null ? { memberEmail: record.memberEmail } : {}),
    ...(record.revokedAt !== null ? { revokedAt: record.revokedAt } : {}),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const seatAssignmentValues = (assignment: SeatAssignment) => ({
  id: assignment.id,
  subscriptionId: assignment.subscriptionId,
  memberId: assignment.memberId,
  status: assignment.status,
  assignedAt: assignment.assignedAt,
  memberEmail: assignment.memberEmail ?? null,
  revokedAt: assignment.revokedAt ?? null,
});

type SeatInvitationRow = typeof billingSchema.billingSeatInvitations.$inferSelect;
type SeatChargeLineRow = typeof billingSchema.billingSeatChargeLines.$inferSelect;

const mapSeatInvitation = (record: SeatInvitationRow): SeatInvitation | null => {
  const parsed = seatInvitationSchema.safeParse({
    id: record.id,
    subscriptionId: record.subscriptionId,
    memberEmail: record.memberEmail,
    token: record.token,
    status: record.status,
    invitedAt: record.invitedAt,
    metadata: record.metadata,
    ...(record.invitedBy !== null ? { invitedBy: record.invitedBy } : {}),
    ...(record.claimedAt !== null ? { claimedAt: record.claimedAt } : {}),
    ...(record.revokedAt !== null ? { revokedAt: record.revokedAt } : {}),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const seatInvitationValues = (invitation: SeatInvitation) => ({
  id: invitation.id,
  subscriptionId: invitation.subscriptionId,
  memberEmail: invitation.memberEmail,
  token: invitation.token,
  status: invitation.status,
  invitedAt: invitation.invitedAt,
  metadata: invitation.metadata ?? {},
  invitedBy: invitation.invitedBy ?? null,
  claimedAt: invitation.claimedAt ?? null,
  revokedAt: invitation.revokedAt ?? null,
});

const mapSeatChargeLine = (record: SeatChargeLineRow): SeatChargeLine | null => {
  const parsed = seatChargeLineSchema.safeParse({
    id: record.id,
    subscriptionId: record.subscriptionId,
    planId: record.planId,
    label: record.label,
    currency: record.currency,
    seats: record.seats,
    billableSeats: record.billableSeats,
    unitAmount: record.unitAmount,
    amount: record.amount,
    createdAt: record.createdAt.toISOString(),
    ...(record.proratedFromSeats !== null ? { proratedFromSeats: record.proratedFromSeats } : {}),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

export const drizzleSeatsAdapter = (
  db: BillingPgDatabase,
  options: DrizzleSeatsAdapterOptions = {},
): SeatsDatabaseAdapter => {
  const schema = options.schema ?? billingSchema;

  return {
    seatPlans: {
      create: async (input: SeatPlan) => {
        const planToStore = billingSeatPlanDbInsertSchema.parse(input);
        const result = await runQuery("create seat plan", async () => {
          const rows = await db.insert(schema.billingSeatPlans).values(planToStore).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Plano de assentos não foi persistido.");
        }

        const plan = mapSeatPlan(result.value);

        if (plan === null) {
          return invalidStoredRecord("Plano de assentos persistido com shape inválido.");
        }

        return Result.ok(plan);
      },
      findById: async (id: string) => {
        const result = await runQuery("find seat plan", async () => {
          const rows = await db
            .select()
            .from(schema.billingSeatPlans)
            .where(eq(schema.billingSeatPlans.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const plan = mapSeatPlan(result.value);

        if (plan === null) {
          return invalidStoredRecord("Plano de assentos persistido com shape inválido.");
        }

        return Result.ok(plan);
      },
    },
    assignments: {
      create: async (input: SeatAssignment) => {
        const assignmentToStore = billingSeatAssignmentDbInsertSchema.parse(
          seatAssignmentValues(input),
        );
        const result = await runQuery("create seat assignment", async () => {
          const rows = await db
            .insert(schema.billingSeatAssignments)
            .values(assignmentToStore)
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Atribuição de assento não foi persistida.");
        }

        const assignment = mapSeatAssignment(result.value);

        if (assignment === null) {
          return invalidStoredRecord("Atribuição de assento persistida com shape inválido.");
        }

        return Result.ok(assignment);
      },
      update: async (input: SeatAssignment) => {
        const result = await runQuery("update seat assignment", async () => {
          const rows = await db
            .update(schema.billingSeatAssignments)
            .set({
              status: input.status,
              memberEmail: input.memberEmail ?? null,
              revokedAt: input.revokedAt ?? null,
            })
            .where(eq(schema.billingSeatAssignments.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Atribuição de assento não foi atualizada.");
        }

        const assignment = mapSeatAssignment(result.value);

        if (assignment === null) {
          return invalidStoredRecord("Atribuição de assento persistida com shape inválido.");
        }

        return Result.ok(assignment);
      },
      findById: async (id: string) => {
        const result = await runQuery("find seat assignment", async () => {
          const rows = await db
            .select()
            .from(schema.billingSeatAssignments)
            .where(eq(schema.billingSeatAssignments.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const assignment = mapSeatAssignment(result.value);

        if (assignment === null) {
          return invalidStoredRecord("Atribuição de assento persistida com shape inválido.");
        }

        return Result.ok(assignment);
      },
      listActive: async (subscriptionId: string) => {
        const result = await runQuery("list active seat assignments", async () =>
          db
            .select()
            .from(schema.billingSeatAssignments)
            .where(
              and(
                eq(schema.billingSeatAssignments.subscriptionId, subscriptionId),
                eq(schema.billingSeatAssignments.status, "active"),
              ),
            ),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const assignments: SeatAssignment[] = [];

        for (const row of result.value) {
          const assignment = mapSeatAssignment(row);

          if (assignment === null) {
            return invalidStoredRecord("Atribuição de assento persistida com shape inválido.");
          }

          assignments.push(assignment);
        }

        return Result.ok(assignments);
      },
      findActiveByMember: async (input: { subscriptionId: string; memberId: string }) => {
        const result = await runQuery("find active seat assignment by member", async () => {
          const rows = await db
            .select()
            .from(schema.billingSeatAssignments)
            .where(
              and(
                eq(schema.billingSeatAssignments.subscriptionId, input.subscriptionId),
                eq(schema.billingSeatAssignments.memberId, input.memberId),
                eq(schema.billingSeatAssignments.status, "active"),
              ),
            )
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const assignment = mapSeatAssignment(result.value);

        if (assignment === null) {
          return invalidStoredRecord("Atribuição de assento persistida com shape inválido.");
        }

        return Result.ok(assignment);
      },
    },
    invitations: {
      create: async (input: SeatInvitation) => {
        const result = await runQuery("create seat invitation", async () => {
          const rows = await db
            .insert(schema.billingSeatInvitations)
            .values(seatInvitationValues(input))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Convite de assento não foi persistido.");
        }

        const invitation = mapSeatInvitation(result.value);

        if (invitation === null) {
          return invalidStoredRecord("Convite de assento persistido com shape inválido.");
        }

        return Result.ok(invitation);
      },
      update: async (input: SeatInvitation) => {
        const result = await runQuery("update seat invitation", async () => {
          const rows = await db
            .update(schema.billingSeatInvitations)
            .set({
              status: input.status,
              metadata: input.metadata ?? {},
              invitedBy: input.invitedBy ?? null,
              claimedAt: input.claimedAt ?? null,
              revokedAt: input.revokedAt ?? null,
            })
            .where(eq(schema.billingSeatInvitations.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Convite de assento não foi atualizado.");
        }

        const invitation = mapSeatInvitation(result.value);

        if (invitation === null) {
          return invalidStoredRecord("Convite de assento persistido com shape inválido.");
        }

        return Result.ok(invitation);
      },
      findById: async (id: string) => {
        const result = await runQuery("find seat invitation", async () => {
          const rows = await db
            .select()
            .from(schema.billingSeatInvitations)
            .where(eq(schema.billingSeatInvitations.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const invitation = mapSeatInvitation(result.value);

        if (invitation === null) {
          return invalidStoredRecord("Convite de assento persistido com shape inválido.");
        }

        return Result.ok(invitation);
      },
      findByToken: async (token: string) => {
        const result = await runQuery("find seat invitation by token", async () => {
          const rows = await db
            .select()
            .from(schema.billingSeatInvitations)
            .where(eq(schema.billingSeatInvitations.token, token))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const invitation = mapSeatInvitation(result.value);

        if (invitation === null) {
          return invalidStoredRecord("Convite de assento persistido com shape inválido.");
        }

        return Result.ok(invitation);
      },
      findPendingByEmail: async (input: { subscriptionId: string; memberEmail: string }) => {
        const result = await runQuery("find pending seat invitation by email", async () => {
          const rows = await db
            .select()
            .from(schema.billingSeatInvitations)
            .where(
              and(
                eq(schema.billingSeatInvitations.subscriptionId, input.subscriptionId),
                eq(schema.billingSeatInvitations.memberEmail, input.memberEmail),
                eq(schema.billingSeatInvitations.status, "pending"),
              ),
            )
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const invitation = mapSeatInvitation(result.value);

        if (invitation === null) {
          return invalidStoredRecord("Convite de assento persistido com shape inválido.");
        }

        return Result.ok(invitation);
      },
    },
    charges: {
      create: async (input: SeatChargeLine) => {
        const result = await runQuery("create seat charge line", async () => {
          const rows = await db
            .insert(schema.billingSeatChargeLines)
            .values({
              id: input.id,
              subscriptionId: input.subscriptionId,
              planId: input.planId,
              label: input.label,
              currency: input.currency,
              seats: input.seats,
              billableSeats: input.billableSeats,
              unitAmount: input.unitAmount,
              amount: input.amount,
              proratedFromSeats: input.proratedFromSeats ?? null,
            })
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Linha de cobrança de assento não foi persistida.");
        }

        const charge = mapSeatChargeLine(result.value);

        if (charge === null) {
          return invalidStoredRecord("Linha de cobrança de assento persistida com shape inválido.");
        }

        return Result.ok(charge);
      },
    },
  };
};
