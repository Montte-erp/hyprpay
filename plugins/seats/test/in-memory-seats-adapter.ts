import { Result } from "better-result";
import type { SeatsDatabaseAdapter } from "../src/contracts/seats-database-adapter";
import type {
  SeatAssignment,
  SeatChargeLine,
  SeatInvitation,
  SeatPlan,
} from "../src/schemas/seat-schema";
import type { BillingResult } from "../src/results/billing-result";

/**
 * Minimal in-memory `SeatsDatabaseAdapter` for tests. Captures created charges
 * so specs can assert on the billable line that the `charge` op produces.
 */
export interface InMemorySeatsAdapter extends SeatsDatabaseAdapter {
  readonly charges: SeatsDatabaseAdapter["charges"] & {
    all(): SeatChargeLine[];
  };
}

const ok = <T>(value: T): BillingResult<T> => Result.ok(value);

export const createInMemorySeatsAdapter = (): InMemorySeatsAdapter => {
  const plans = new Map<string, SeatPlan>();
  const assignments = new Map<string, SeatAssignment>();
  const invitations = new Map<string, SeatInvitation>();
  const charges: SeatChargeLine[] = [];

  return {
    seatPlans: {
      create: async plan => {
        plans.set(plan.id, plan);
        return ok(plan);
      },
      findById: async id => ok(plans.get(id) ?? null),
    },
    assignments: {
      create: async assignment => {
        assignments.set(assignment.id, assignment);
        return ok(assignment);
      },
      update: async assignment => {
        assignments.set(assignment.id, assignment);
        return ok(assignment);
      },
      findById: async id => ok(assignments.get(id) ?? null),
      listActive: async subscriptionId =>
        ok(
          [...assignments.values()].filter(
            a => a.subscriptionId === subscriptionId && a.status === "active",
          ),
        ),
      findActiveByMember: async ({ subscriptionId, memberId }) =>
        ok(
          [...assignments.values()].find(
            a =>
              a.subscriptionId === subscriptionId &&
              a.memberId === memberId &&
              a.status === "active",
          ) ?? null,
        ),
    },
    invitations: {
      create: async invitation => {
        invitations.set(invitation.id, invitation);
        return ok(invitation);
      },
      update: async invitation => {
        invitations.set(invitation.id, invitation);
        return ok(invitation);
      },
      findById: async id => ok(invitations.get(id) ?? null),
      findByToken: async token =>
        ok([...invitations.values()].find(i => i.token === token) ?? null),
      findPendingByEmail: async ({ subscriptionId, memberEmail }) =>
        ok(
          [...invitations.values()].find(
            i =>
              i.subscriptionId === subscriptionId &&
              i.memberEmail === memberEmail &&
              i.status === "pending",
          ) ?? null,
        ),
    },
    charges: {
      create: async charge => {
        charges.push(charge);
        return ok(charge);
      },
      all: () => [...charges],
    },
  };
};
