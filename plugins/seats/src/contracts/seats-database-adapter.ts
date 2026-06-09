import type { BillingResult } from "../results/billing-result";
import type {
  SeatAssignment,
  SeatChargeLine,
  SeatInvitation,
  SeatPlan,
} from "../schemas/seat-schema";

export interface SeatsDatabaseAdapter {
  seatPlans: {
    create(input: SeatPlan): Promise<BillingResult<SeatPlan>>;
    findById(id: string): Promise<BillingResult<SeatPlan | null>>;
  };
  assignments: {
    create(input: SeatAssignment): Promise<BillingResult<SeatAssignment>>;
    update(input: SeatAssignment): Promise<BillingResult<SeatAssignment>>;
    findById(id: string): Promise<BillingResult<SeatAssignment | null>>;
    listActive(subscriptionId: string): Promise<BillingResult<SeatAssignment[]>>;
    findActiveByMember(input: {
      subscriptionId: string;
      memberId: string;
    }): Promise<BillingResult<SeatAssignment | null>>;
  };
  invitations: {
    create(input: SeatInvitation): Promise<BillingResult<SeatInvitation>>;
    update(input: SeatInvitation): Promise<BillingResult<SeatInvitation>>;
    findById(id: string): Promise<BillingResult<SeatInvitation | null>>;
    findByToken(token: string): Promise<BillingResult<SeatInvitation | null>>;
    findPendingByEmail(input: {
      subscriptionId: string;
      memberEmail: string;
    }): Promise<BillingResult<SeatInvitation | null>>;
  };
  charges: {
    create(input: SeatChargeLine): Promise<BillingResult<SeatChargeLine>>;
  };
}

export type SeatsLookupAdapter = Pick<SeatsDatabaseAdapter, "assignments">;
