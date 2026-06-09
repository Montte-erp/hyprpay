import { z } from "zod";
import { currencySchema, metadataSchema } from "./shared-schema";

export const seatAssignmentStatusSchema = z.enum(["active", "revoked"]);

export const seatInvitationStatusSchema = z.enum(["pending", "claimed", "revoked"]);

/**
 * Per-seat pricing mode for a seat plan.
 * - `flat`: every billable seat costs `perSeatAmount` (the historical behaviour).
 * - `volume`: the band the *total* billable seat count falls into sets a single
 *   unit price applied to ALL billable seats.
 * - `tiered`: billable seats are billed band-by-band ("graduated"): the seats in
 *   each band are charged that band's unit price and the totals are summed.
 */
export const seatPricingModeSchema = z.enum(["flat", "volume", "tiered"]);

/**
 * A single pricing band. `upTo` is the inclusive upper bound of billable seats
 * the band covers; the final band omits `upTo` (open-ended). Bands are ordered
 * ascending by `upTo`; `unitAmount` is integer centavos per seat in the band.
 */
export const seatPricingTierSchema = z.object({
  upTo: z.number().int().positive().optional(),
  unitAmount: z.number().int().nonnegative(),
});

export const seatPlanInputSchema = z.object({
  priceId: z.string().min(1),
  includedSeats: z.number().int().nonnegative().default(0),
  perSeatAmount: z.number().int().nonnegative(),
  pricingMode: seatPricingModeSchema.default("flat"),
  tiers: z.array(seatPricingTierSchema).optional(),
  metadata: metadataSchema.optional(),
});

export const seatPlanSchema = seatPlanInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
});

export const seatAssignInputSchema = z.object({
  subscriptionId: z.string().min(1),
  memberId: z.string().min(1),
  memberEmail: z.string().email().optional(),
  metadata: metadataSchema.optional(),
});

export const seatAssignmentSchema = z.object({
  id: z.string().min(1),
  subscriptionId: z.string().min(1),
  memberId: z.string().min(1),
  memberEmail: z.string().email().optional(),
  status: seatAssignmentStatusSchema,
  assignedAt: z.string().min(1),
  revokedAt: z.string().min(1).optional(),
});

export const seatInviteInputSchema = z.object({
  subscriptionId: z.string().min(1),
  memberEmail: z.string().email(),
  invitedBy: z.string().min(1).optional(),
  metadata: metadataSchema.optional(),
});

export const seatInvitationSchema = z.object({
  id: z.string().min(1),
  subscriptionId: z.string().min(1),
  memberEmail: z.string().email(),
  token: z.string().min(1),
  invitedBy: z.string().min(1).optional(),
  status: seatInvitationStatusSchema,
  invitedAt: z.string().min(1),
  claimedAt: z.string().min(1).optional(),
  revokedAt: z.string().min(1).optional(),
  metadata: metadataSchema.optional(),
});

export const seatClaimInputSchema = z.object({
  token: z.string().min(1),
  memberId: z.string().min(1),
  metadata: metadataSchema.optional(),
});

/**
 * A billable charge line produced for the billable seats of a subscription
 * during a billing window (mirrors the orders plugin order-line shape, kept
 * local so seats does not import another plugin's internals).
 */
export const seatChargeLineSchema = z.object({
  id: z.string().min(1),
  subscriptionId: z.string().min(1),
  planId: z.string().min(1),
  label: z.string().min(1),
  currency: currencySchema,
  seats: z.number().int().nonnegative(),
  billableSeats: z.number().int().nonnegative(),
  unitAmount: z.number().int().nonnegative(),
  amount: z.number().int().nonnegative(),
  proratedFromSeats: z.number().int().nonnegative().optional(),
  createdAt: z.string().min(1),
});

export type SeatAssignmentStatus = z.infer<typeof seatAssignmentStatusSchema>;
export type SeatInvitationStatus = z.infer<typeof seatInvitationStatusSchema>;
export type SeatPricingMode = z.infer<typeof seatPricingModeSchema>;
export type SeatPricingTier = z.infer<typeof seatPricingTierSchema>;
export type SeatPlanInput = z.infer<typeof seatPlanInputSchema>;
export type SeatPlan = z.infer<typeof seatPlanSchema>;
export type SeatAssignInput = z.infer<typeof seatAssignInputSchema>;
export type SeatAssignment = z.infer<typeof seatAssignmentSchema>;
export type SeatInviteInput = z.infer<typeof seatInviteInputSchema>;
export type SeatInvitation = z.infer<typeof seatInvitationSchema>;
export type SeatClaimInput = z.infer<typeof seatClaimInputSchema>;
export type SeatChargeLine = z.infer<typeof seatChargeLineSchema>;
