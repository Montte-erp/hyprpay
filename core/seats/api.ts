import { Effect } from "effect";
import { invalidInput, notFound } from "../errors";
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import { findBenefit } from "../internal/catalog";
import { createSeatRecord, now } from "../internal/records";
import { decodeSeatAssignInput,
decodeSeatRevokeInput,
type SeatAssignInput,
type SeatRevokeInput, } from "../seats/schema"
import type { Seat } from "../schemas";
import type { BillingEffect } from "../store";

const seatLimitForCustomer = (options: CreateHyprPayOptions, customerId: string): BillingEffect<number> =>
  Effect.gen(function* () {
    const grants = yield* options.store.benefitGrants.list({ customerId, status: "active", type: "seats" });
    let total = 0;

    for (const grant of grants) {
      const grantBenefit = findBenefit(options.catalog ?? [], grant.benefitId);

      if (grantBenefit?.type === "seats") {
        total += grantBenefit.quantity;
      }
    }

    return total;
  });

export const createSeatsApi = (options: CreateHyprPayOptions) => ({
  assign: (input: SeatAssignInput): BillingEffect<Seat> => Effect.gen(function* () {
    const parsed = yield* decodeSeatAssignInput(input);
    const customer = yield* options.store.customers.findById(parsed.customerId);

    if (customer === null) {
      return yield* Effect.fail(notFound());
    }

    const existing = yield* options.store.seats.list({
      customerId: parsed.customerId,
      memberId: parsed.memberId,
      status: "active",
    });
    const seat = existing[0];

    if (seat !== undefined) {
      return seat;
    }

    const limit = yield* seatLimitForCustomer(options, parsed.customerId);

    if (limit > 0) {
      const activeSeats = yield* options.store.seats.list({ customerId: parsed.customerId, status: "active" });

      if (activeSeats.length >= limit) {
        return yield* Effect.fail(invalidInput());
      }
    }

    return yield* options.store.seats.create(createSeatRecord(parsed));
  }),
  revoke: (input: SeatRevokeInput): BillingEffect<Seat> => Effect.gen(function* () {
    const parsed = yield* decodeSeatRevokeInput(input);
    const seat = yield* options.store.seats.findById(parsed.seatId);

    if (seat === null) {
      return yield* Effect.fail(notFound());
    }

    return yield* options.store.seats.update(parsed.seatId, {
      status: "revoked",
      updatedAt: now(),
    });
  }),
  list: (filter?: Partial<Seat>): BillingEffect<readonly Seat[]> => options.store.seats.list(filter),
});

export const seatsPlugin = defineHyprPayPlugin({
  id: "seats",
  build: createSeatsApi,
});
