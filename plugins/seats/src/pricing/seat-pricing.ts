import { multiplyQuantity, sumAmounts } from "@hyprpay/money";
import type { SeatPlan, SeatPricingTier } from "../schemas/seat-schema";

/**
 * Resolve the billable seat count for a plan: active seats above the included
 * allowance, never negative.
 */
export const billableSeatsFor = (plan: SeatPlan, activeSeats: number): number =>
  Math.max(0, activeSeats - plan.includedSeats);

/**
 * Order tiers ascending by their inclusive upper bound. The open-ended band
 * (no `upTo`) always sorts last; any others keep their relative order.
 */
const orderedTiers = (tiers: readonly SeatPricingTier[]): SeatPricingTier[] =>
  [...tiers].sort((a, b) => {
    if (a.upTo === undefined) {
      return 1;
    }
    if (b.upTo === undefined) {
      return -1;
    }
    return a.upTo - b.upTo;
  });

/**
 * `volume` pricing: the band the total billable-seat count lands in dictates a
 * single unit price applied to EVERY billable seat. Falls back to the plan's
 * flat `perSeatAmount` when no band matches.
 */
const volumeAmount = (plan: SeatPlan, billableSeats: number): number => {
  if (billableSeats <= 0) {
    return 0;
  }

  const tiers = orderedTiers(plan.tiers ?? []);
  for (const tier of tiers) {
    if (tier.upTo === undefined || billableSeats <= tier.upTo) {
      return multiplyQuantity(tier.unitAmount, billableSeats);
    }
  }

  return multiplyQuantity(plan.perSeatAmount, billableSeats);
};

/**
 * `tiered` (graduated) pricing: seats are billed band-by-band. The seats that
 * fall inside each band are charged that band's unit price; the per-band totals
 * are summed. Any seats beyond the last bounded band use the open-ended band,
 * or the plan's flat `perSeatAmount` if none exists.
 */
const tieredAmount = (plan: SeatPlan, billableSeats: number): number => {
  if (billableSeats <= 0) {
    return 0;
  }

  const tiers = orderedTiers(plan.tiers ?? []);
  const lineAmounts: number[] = [];
  let allocated = 0;
  let lowerBound = 0;

  for (const tier of tiers) {
    if (allocated >= billableSeats) {
      break;
    }

    const bandCapacity =
      tier.upTo === undefined ? billableSeats - allocated : tier.upTo - lowerBound;
    const seatsInBand = Math.min(Math.max(0, bandCapacity), billableSeats - allocated);

    if (seatsInBand > 0) {
      lineAmounts.push(multiplyQuantity(tier.unitAmount, seatsInBand));
      allocated += seatsInBand;
    }

    if (tier.upTo !== undefined) {
      lowerBound = tier.upTo;
    }
  }

  const remaining = billableSeats - allocated;
  if (remaining > 0) {
    lineAmounts.push(multiplyQuantity(plan.perSeatAmount, remaining));
  }

  return sumAmounts(...lineAmounts);
};

/**
 * Compute the charge (integer centavos) for `billableSeats` under `plan`,
 * honouring the plan's pricing mode (`flat` | `volume` | `tiered`).
 */
export const seatChargeAmount = (plan: SeatPlan, billableSeats: number): number => {
  if (billableSeats <= 0) {
    return 0;
  }

  switch (plan.pricingMode) {
    case "volume":
      return volumeAmount(plan, billableSeats);
    case "tiered":
      return tieredAmount(plan, billableSeats);
    case "flat":
    default:
      return multiplyQuantity(plan.perSeatAmount, billableSeats);
  }
};

/**
 * Effective per-seat unit price = total charge / billable seats, rounded down
 * for display purposes. Returns the plan's flat `perSeatAmount` when there are
 * no billable seats so the quote still carries a meaningful unit.
 */
export const effectiveUnitAmount = (plan: SeatPlan, billableSeats: number): number => {
  if (billableSeats <= 0) {
    return plan.perSeatAmount;
  }

  return Math.floor(seatChargeAmount(plan, billableSeats) / billableSeats);
};
