import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import type {
  MeterCreditKey,
  MeterEventPeriodQuery,
  MetersDatabaseAdapter,
} from "./contracts/meters-database-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type {
  Meter,
  MeterAggregation,
  MeterBalance,
  MeterCredit,
  MeterCreditGrantInput,
  MeterEvent,
  MeterEventInput,
  MeterFilter,
  MeterInput,
  MeterQuantities,
  MeterQuantitiesInterval,
  MeterQuantityBucket,
  UsageSnapshot,
} from "./schemas/meter-schema";
import {
  meterAggregationSchema,
  meterBalanceSchema,
  meterCreditGrantInputSchema,
  meterCreditSchema,
  meterEventInputSchema,
  meterEventSchema,
  meterFilterSchema,
  meterInputSchema,
  meterQuantitiesSchema,
  meterQuantityBucketSchema,
  meterSchema,
  usageSnapshotSchema,
} from "./schemas/meter-schema";
import { metadataSchema } from "./schemas/shared-schema";

export interface AggregateUsageInput {
  meterId: string;
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
}

export interface MeterBalanceInput {
  meterId: string;
  customerId: string;
}

export interface MeterQuantitiesInput {
  meterId: string;
  periodStart: string;
  periodEnd: string;
  interval: MeterQuantitiesInterval;
  subscriptionId?: string;
  customerId?: string;
}

export interface MetersApi {
  createMeter(input: MeterInput): Promise<BillingResult<Meter>>;
  ingest(input: MeterEventInput): Promise<BillingResult<MeterEvent>>;
  aggregate(input: AggregateUsageInput): Promise<BillingResult<UsageSnapshot>>;
  grantCredit(input: MeterCreditGrantInput): Promise<BillingResult<MeterCredit>>;
  balance(input: MeterBalanceInput): Promise<BillingResult<MeterBalance>>;
  quantities(input: MeterQuantitiesInput): Promise<BillingResult<MeterQuantities>>;
}

export interface MetersPluginOptions {
  database: MetersDatabaseAdapter;
}

export type MeterPluginEvent =
  | { type: "billing.meter.created"; payload: Meter }
  | { type: "billing.meter.event.ingested"; payload: MeterEvent }
  | { type: "billing.meter.credit.granted"; payload: MeterCredit };

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

const emitMeterEvent = async (runtime: HyprPayRuntime, event: MeterPluginEvent) => {
  await runtime.emit(event);
};

/**
 * Reserved metadata key carrying the logical event name on an ingested event.
 * A meter only aggregates events whose declared name matches `meter.eventName`.
 */
const EVENT_NAME_METADATA_KEY = "eventName";

const PERIOD_MS: Record<MeterQuantitiesInterval, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Keep only events that satisfy the meter's filters:
 *  - `eventName`: when an event declares `metadata.eventName`, it must equal
 *    `meter.eventName`. Untagged events (no `eventName` metadata) are kept so
 *    legacy ingestion is not silently dropped.
 *  - property-equals `filters`: every clause must match the event's metadata.
 */
const matchesMeterFilters = (
  meterEventName: string,
  filters: MeterFilter,
  event: MeterEvent,
): boolean => {
  const metadata = event.metadata ?? {};

  const declaredEventName = metadata[EVENT_NAME_METADATA_KEY];
  if (declaredEventName !== undefined && declaredEventName !== meterEventName) {
    return false;
  }

  for (const [key, expected] of Object.entries(filters)) {
    if (metadata[key] !== expected) {
      return false;
    }
  }

  return true;
};

/**
 * Resolve the numeric value an event contributes. When the meter defines a
 * `valueProperty`, read it from `metadata[valueProperty]` (parsed as a number);
 * fall back to `event.value` when the property is absent or not numeric.
 */
const resolveEventValue = (valueProperty: string | undefined, event: MeterEvent): number => {
  if (valueProperty === undefined) {
    return event.value;
  }

  const raw = (event.metadata ?? {})[valueProperty];
  if (raw === undefined) {
    return event.value;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : event.value;
};

const aggregateValues = (
  aggregation: MeterAggregation,
  values: number[],
): number => {
  switch (aggregation) {
    case "count":
      return values.length;
    case "max": {
      if (values.length === 0) {
        return 0;
      }
      let max = values[0] ?? 0;
      for (const value of values) {
        if (value > max) {
          max = value;
        }
      }
      return max;
    }
    case "min": {
      if (values.length === 0) {
        return 0;
      }
      let min = values[0] ?? 0;
      for (const value of values) {
        if (value < min) {
          min = value;
        }
      }
      return min;
    }
    case "average": {
      if (values.length === 0) {
        return 0;
      }
      let total = 0;
      for (const value of values) {
        total += value;
      }
      return total / values.length;
    }
    case "unique": {
      const seen = new Set<number>();
      for (const value of values) {
        seen.add(value);
      }
      return seen.size;
    }
    case "last": {
      if (values.length === 0) {
        return 0;
      }
      const last = values[values.length - 1];
      return last ?? 0;
    }
    case "sum":
    default: {
      let total = 0;
      for (const value of values) {
        total += value;
      }
      return total;
    }
  }
};

/**
 * Apply the meter's filters + value resolution to a raw event list and return
 * the aggregated scalar for the meter's aggregation.
 */
const aggregateMeterEvents = (meter: Meter, events: MeterEvent[]): number => {
  const filtered = events.filter(event =>
    matchesMeterFilters(meter.eventName, meter.filters, event),
  );
  const values = filtered.map(event => resolveEventValue(meter.valueProperty, event));
  return aggregateValues(meter.aggregation, values);
};

export const meters = (
  options: MetersPluginOptions,
): HyprPayPlugin<"meters", MetersApi> => ({
  id: "meters",
  namespace: "meters",
  extendApi: runtime => ({
    createMeter: async (input: MeterInput) => {
      const parsed = meterInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const meter: Meter = {
        ...parsed.data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      const meterResult = await options.database.meters.create(meter);

      if (Result.isError(meterResult)) {
        return Result.err(meterResult.error);
      }

      await emitMeterEvent(runtime, {
        type: "billing.meter.created",
        payload: meterResult.value,
      });

      return meterResult;
    },
    ingest: async (input: MeterEventInput) => {
      const parsed = meterEventInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const idempotencyKey = parsed.data.idempotencyKey;

      if (idempotencyKey !== undefined) {
        const existingResult =
          await options.database.meterEvents.findByIdempotencyKey(idempotencyKey);

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value !== null) {
          return Result.ok(existingResult.value);
        }
      }

      const meterEvent: MeterEvent = {
        ...parsed.data,
        id: crypto.randomUUID(),
        timestamp: parsed.data.timestamp ?? new Date().toISOString(),
      };

      const appendResult = await options.database.meterEvents.append(meterEvent);

      if (Result.isError(appendResult)) {
        return Result.err(appendResult.error);
      }

      // Draw down the customer's credit balance for this meter when a ledger
      // exists. Absence of a ledger means the customer has no credits to track.
      const creditKey: MeterCreditKey = {
        meterId: appendResult.value.meterId,
        customerId: appendResult.value.customerId,
      };
      const creditResult = await options.database.credits.find(creditKey);

      if (Result.isError(creditResult)) {
        return Result.err(creditResult.error);
      }

      if (creditResult.value !== null) {
        const credit = creditResult.value;
        const updatedCredit: MeterCredit = {
          ...credit,
          consumed: credit.consumed + appendResult.value.value,
          updatedAt: new Date().toISOString(),
        };
        const upsertResult = await options.database.credits.upsert(updatedCredit);

        if (Result.isError(upsertResult)) {
          return Result.err(upsertResult.error);
        }
      }

      await emitMeterEvent(runtime, {
        type: "billing.meter.event.ingested",
        payload: appendResult.value,
      });

      return appendResult;
    },
    aggregate: async (input: AggregateUsageInput) => {
      const meterResult = await options.database.meters.findById(input.meterId);

      if (Result.isError(meterResult)) {
        return Result.err(meterResult.error);
      }

      if (meterResult.value === null) {
        return notFound("Medidor de billing não encontrado.");
      }

      const query: MeterEventPeriodQuery = {
        meterId: input.meterId,
        subscriptionId: input.subscriptionId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      };

      const eventsResult = await options.database.meterEvents.listForPeriod(query);

      if (Result.isError(eventsResult)) {
        return Result.err(eventsResult.error);
      }

      const aggregatedValue = aggregateMeterEvents(meterResult.value, eventsResult.value);

      const snapshot: UsageSnapshot = {
        id: crypto.randomUUID(),
        meterId: input.meterId,
        subscriptionId: input.subscriptionId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        aggregatedValue,
        createdAt: new Date().toISOString(),
      };

      return options.database.snapshots.create(snapshot);
    },
    grantCredit: async (input: MeterCreditGrantInput) => {
      const parsed = meterCreditGrantInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const meterResult = await options.database.meters.findById(parsed.data.meterId);

      if (Result.isError(meterResult)) {
        return Result.err(meterResult.error);
      }

      if (meterResult.value === null) {
        return notFound("Medidor de billing não encontrado.");
      }

      const key: MeterCreditKey = {
        meterId: parsed.data.meterId,
        customerId: parsed.data.customerId,
      };
      const existingResult = await options.database.credits.find(key);

      if (Result.isError(existingResult)) {
        return Result.err(existingResult.error);
      }

      const now = new Date().toISOString();
      const existing = existingResult.value;
      const credit: MeterCredit =
        existing === null
          ? {
              id: crypto.randomUUID(),
              meterId: parsed.data.meterId,
              customerId: parsed.data.customerId,
              granted: parsed.data.amount,
              consumed: 0,
              createdAt: now,
              updatedAt: now,
            }
          : {
              ...existing,
              granted: existing.granted + parsed.data.amount,
              updatedAt: now,
            };

      const upsertResult = await options.database.credits.upsert(credit);

      if (Result.isError(upsertResult)) {
        return Result.err(upsertResult.error);
      }

      await emitMeterEvent(runtime, {
        type: "billing.meter.credit.granted",
        payload: upsertResult.value,
      });

      return upsertResult;
    },
    balance: async (input: MeterBalanceInput) => {
      const meterResult = await options.database.meters.findById(input.meterId);

      if (Result.isError(meterResult)) {
        return Result.err(meterResult.error);
      }

      if (meterResult.value === null) {
        return notFound("Medidor de billing não encontrado.");
      }

      const key: MeterCreditKey = {
        meterId: input.meterId,
        customerId: input.customerId,
      };
      const creditResult = await options.database.credits.find(key);

      if (Result.isError(creditResult)) {
        return Result.err(creditResult.error);
      }

      const granted = creditResult.value?.granted ?? 0;
      const consumed = creditResult.value?.consumed ?? 0;

      const balance: MeterBalance = {
        meterId: input.meterId,
        customerId: input.customerId,
        granted,
        consumed,
        balance: granted - consumed,
      };

      return Result.ok(balance);
    },
    quantities: async (input: MeterQuantitiesInput) => {
      const meterResult = await options.database.meters.findById(input.meterId);

      if (Result.isError(meterResult)) {
        return Result.err(meterResult.error);
      }

      if (meterResult.value === null) {
        return notFound("Medidor de billing não encontrado.");
      }

      const start = Date.parse(input.periodStart);
      const end = Date.parse(input.periodEnd);

      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
        return invalidBillingInput("Período inválido para leitura de quantidades.");
      }

      const meter = meterResult.value;
      const step = PERIOD_MS[input.interval];
      const buckets: MeterQuantityBucket[] = [];

      for (let bucketStart = start; bucketStart < end; bucketStart += step) {
        const bucketEnd = Math.min(bucketStart + step, end);
        const periodStart = new Date(bucketStart).toISOString();
        const periodEnd = new Date(bucketEnd).toISOString();

        const query: MeterEventPeriodQuery = {
          meterId: input.meterId,
          periodStart,
          periodEnd,
          ...(input.subscriptionId !== undefined
            ? { subscriptionId: input.subscriptionId }
            : {}),
          ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        };

        const eventsResult = await options.database.meterEvents.listForPeriod(query);

        if (Result.isError(eventsResult)) {
          return Result.err(eventsResult.error);
        }

        buckets.push({
          periodStart,
          periodEnd,
          value: aggregateMeterEvents(meter, eventsResult.value),
        });
      }

      const quantities: MeterQuantities = {
        meterId: input.meterId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        interval: input.interval,
        buckets,
      };

      return Result.ok(quantities);
    },
  }),
});

export type { BillingResult, MetersDatabaseAdapter };
export { createInMemoryMetersAdapter } from "./in-memory-meters-adapter";
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export {
  meterAggregationSchema,
  meterBalanceSchema,
  meterCreditGrantInputSchema,
  meterCreditSchema,
  meterEventInputSchema,
  meterEventSchema,
  meterFilterSchema,
  meterInputSchema,
  meterQuantitiesSchema,
  meterQuantityBucketSchema,
  meterSchema,
  usageSnapshotSchema,
};
export type {
  Meter,
  MeterAggregation,
  MeterBalance,
  MeterCredit,
  MeterCreditGrantInput,
  MeterEvent,
  MeterEventInput,
  MeterFilter,
  MeterInput,
  MeterQuantities,
  MeterQuantitiesInterval,
  MeterQuantityBucket,
  UsageSnapshot,
};
export { metadataSchema };
