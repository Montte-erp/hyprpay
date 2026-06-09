import { Result } from "better-result";
import type {
  MeterCreditKey,
  MeterEventPeriodQuery,
  MetersDatabaseAdapter,
} from "./contracts/meters-database-adapter";
import type {
  Meter,
  MeterCredit,
  MeterEvent,
  UsageSnapshot,
} from "./schemas/meter-schema";

/**
 * In-memory `MetersDatabaseAdapter`. Useful for tests and local composition;
 * production wiring uses the Drizzle adapter. Events are append-only and
 * immutable, mirroring the contract's semantics.
 */
export const createInMemoryMetersAdapter = (): MetersDatabaseAdapter => {
  const meters = new Map<string, Meter>();
  const events: MeterEvent[] = [];
  const eventsByIdempotencyKey = new Map<string, MeterEvent>();
  const snapshots: UsageSnapshot[] = [];
  const credits = new Map<string, MeterCredit>();

  const creditKey = (key: MeterCreditKey): string => `${key.meterId}::${key.customerId}`;

  const isWithinPeriod = (
    timestamp: string,
    periodStart: string,
    periodEnd: string,
  ): boolean => {
    const at = Date.parse(timestamp);
    const start = Date.parse(periodStart);
    const end = Date.parse(periodEnd);

    if (Number.isNaN(at) || Number.isNaN(start) || Number.isNaN(end)) {
      return false;
    }

    return at >= start && at < end;
  };

  return {
    meters: {
      create: async (input: Meter) => {
        meters.set(input.id, input);
        return Result.ok(input);
      },
      findById: async (id: string) => Result.ok(meters.get(id) ?? null),
      findBySlug: async (slug: string) => {
        for (const meter of meters.values()) {
          if (meter.slug === slug) {
            return Result.ok(meter);
          }
        }
        return Result.ok(null);
      },
    },
    meterEvents: {
      append: async (input: MeterEvent) => {
        events.push(input);
        if (input.idempotencyKey !== undefined) {
          eventsByIdempotencyKey.set(input.idempotencyKey, input);
        }
        return Result.ok(input);
      },
      listForPeriod: async (query: MeterEventPeriodQuery) => {
        const matches = events.filter(event => {
          if (event.meterId !== query.meterId) {
            return false;
          }
          if (query.subscriptionId !== undefined && event.subscriptionId !== query.subscriptionId) {
            return false;
          }
          if (query.customerId !== undefined && event.customerId !== query.customerId) {
            return false;
          }
          return isWithinPeriod(event.timestamp, query.periodStart, query.periodEnd);
        });
        return Result.ok(matches);
      },
      findByIdempotencyKey: async (key: string) =>
        Result.ok(eventsByIdempotencyKey.get(key) ?? null),
    },
    snapshots: {
      create: async (input: UsageSnapshot) => {
        snapshots.push(input);
        return Result.ok(input);
      },
    },
    credits: {
      find: async (key: MeterCreditKey) => Result.ok(credits.get(creditKey(key)) ?? null),
      upsert: async (input: MeterCredit) => {
        credits.set(creditKey({ meterId: input.meterId, customerId: input.customerId }), input);
        return Result.ok(input);
      },
    },
  };
};
