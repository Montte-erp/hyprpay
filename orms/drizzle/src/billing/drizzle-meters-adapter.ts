import { and, eq, gte, lte } from "drizzle-orm";
import { Result } from "better-result";
import type {
  BillingResult,
  Meter,
  MeterCredit,
  MeterEvent,
  MetersDatabaseAdapter,
  UsageSnapshot,
} from "../meters-plugin";
import {
  BillingError,
  billingErrors,
  meterCreditSchema,
  meterEventSchema,
  meterSchema,
  usageSnapshotSchema,
} from "../meters-plugin";
import type { BillingPgDatabase } from "./drizzle-adapter";
import { billingSchema } from "./billing-schema";
import { drizzleQueryError } from "./errors/drizzle-errors";
import {
  billingMeterEventDbInsertSchema,
  billingMeterDbInsertSchema,
  billingUsageSnapshotDbInsertSchema,
} from "./zod/meter-schemas";

export interface DrizzleMetersAdapterOptions {
  schema?: typeof billingSchema;
}

export interface MeterEventPeriodQuery {
  meterId: string;
  subscriptionId?: string;
  periodStart: string;
  periodEnd: string;
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

type MeterRow = typeof billingSchema.billingMeters.$inferSelect;
type MeterEventRow = typeof billingSchema.billingMeterEvents.$inferSelect;
type UsageSnapshotRow = typeof billingSchema.billingUsageSnapshots.$inferSelect;
type MeterCreditRow = typeof billingSchema.billingMeterCredits.$inferSelect;

const mapMeterCredit = (record: MeterCreditRow): MeterCredit | null => {
  const parsed = meterCreditSchema.safeParse({
    id: record.id,
    meterId: record.meterId,
    customerId: record.customerId,
    granted: record.granted,
    consumed: record.consumed,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const mapMeter = (record: MeterRow): Meter | null => {
  const parsed = meterSchema.safeParse({
    id: record.id,
    slug: record.slug,
    name: record.name,
    eventName: record.eventName,
    aggregation: record.aggregation,
    active: record.active,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    ...(record.valueProperty !== null ? { valueProperty: record.valueProperty } : {}),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const mapMeterEvent = (record: MeterEventRow): MeterEvent | null => {
  const parsed = meterEventSchema.safeParse({
    id: record.id,
    meterId: record.meterId,
    customerId: record.customerId,
    value: record.value,
    timestamp: record.timestamp,
    metadata: record.metadata,
    ...(record.subscriptionId !== null ? { subscriptionId: record.subscriptionId } : {}),
    ...(record.idempotencyKey !== null ? { idempotencyKey: record.idempotencyKey } : {}),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const mapUsageSnapshot = (record: UsageSnapshotRow): UsageSnapshot | null => {
  const parsed = usageSnapshotSchema.safeParse({
    id: record.id,
    meterId: record.meterId,
    subscriptionId: record.subscriptionId,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    aggregatedValue: record.aggregatedValue,
    createdAt: record.createdAt.toISOString(),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

export const drizzleMetersAdapter = (
  db: BillingPgDatabase,
  options: DrizzleMetersAdapterOptions = {},
): MetersDatabaseAdapter => {
  const schema = options.schema ?? billingSchema;

  return {
    meters: {
      create: async (input: Meter) => {
        const meterToStore = billingMeterDbInsertSchema.parse(input);
        const result = await runQuery("create meter", async () => {
          const rows = await db.insert(schema.billingMeters).values(meterToStore).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Medidor não foi persistido.");
        }

        const meter = mapMeter(result.value);

        if (meter === null) {
          return invalidStoredRecord("Medidor persistido com shape inválido.");
        }

        return Result.ok(meter);
      },
      findById: async (id: string) => {
        const result = await runQuery("find meter", async () => {
          const rows = await db
            .select()
            .from(schema.billingMeters)
            .where(eq(schema.billingMeters.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const meter = mapMeter(result.value);

        if (meter === null) {
          return invalidStoredRecord("Medidor persistido com shape inválido.");
        }

        return Result.ok(meter);
      },
      findBySlug: async (slug: string) => {
        const result = await runQuery("find meter by slug", async () => {
          const rows = await db
            .select()
            .from(schema.billingMeters)
            .where(eq(schema.billingMeters.slug, slug))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const meter = mapMeter(result.value);

        if (meter === null) {
          return invalidStoredRecord("Medidor persistido com shape inválido.");
        }

        return Result.ok(meter);
      },
    },
    meterEvents: {
      append: async (input: MeterEvent) => {
        const eventToStore = billingMeterEventDbInsertSchema.parse(input);
        const result = await runQuery("append meter event", async () => {
          const rows = await db
            .insert(schema.billingMeterEvents)
            .values(eventToStore)
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Evento de medição não foi persistido.");
        }

        const event = mapMeterEvent(result.value);

        if (event === null) {
          return invalidStoredRecord("Evento de medição persistido com shape inválido.");
        }

        return Result.ok(event);
      },
      listForPeriod: async (input: MeterEventPeriodQuery) => {
        const conditions = [
          eq(schema.billingMeterEvents.meterId, input.meterId),
          gte(schema.billingMeterEvents.timestamp, input.periodStart),
          lte(schema.billingMeterEvents.timestamp, input.periodEnd),
          ...(input.subscriptionId !== undefined
            ? [eq(schema.billingMeterEvents.subscriptionId, input.subscriptionId)]
            : []),
        ];

        const result = await runQuery("list meter events for period", async () =>
          db.select().from(schema.billingMeterEvents).where(and(...conditions)),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const events: MeterEvent[] = [];

        for (const row of result.value) {
          const event = mapMeterEvent(row);

          if (event === null) {
            return invalidStoredRecord("Evento de medição persistido com shape inválido.");
          }

          events.push(event);
        }

        return Result.ok(events);
      },
      findByIdempotencyKey: async (key: string) => {
        const result = await runQuery("find meter event by idempotency key", async () => {
          const rows = await db
            .select()
            .from(schema.billingMeterEvents)
            .where(eq(schema.billingMeterEvents.idempotencyKey, key))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const event = mapMeterEvent(result.value);

        if (event === null) {
          return invalidStoredRecord("Evento de medição persistido com shape inválido.");
        }

        return Result.ok(event);
      },
    },
    snapshots: {
      create: async (input: UsageSnapshot) => {
        const snapshotToStore = billingUsageSnapshotDbInsertSchema.parse(input);
        const result = await runQuery("create usage snapshot", async () => {
          const rows = await db
            .insert(schema.billingUsageSnapshots)
            .values(snapshotToStore)
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Snapshot de uso não foi persistido.");
        }

        const snapshot = mapUsageSnapshot(result.value);

        if (snapshot === null) {
          return invalidStoredRecord("Snapshot de uso persistido com shape inválido.");
        }

        return Result.ok(snapshot);
      },
    },
    credits: {
      find: async (key) => {
        const result = await runQuery("find meter credit", async () => {
          const rows = await db
            .select()
            .from(schema.billingMeterCredits)
            .where(
              and(
                eq(schema.billingMeterCredits.meterId, key.meterId),
                eq(schema.billingMeterCredits.customerId, key.customerId),
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

        const credit = mapMeterCredit(result.value);

        if (credit === null) {
          return invalidStoredRecord("Crédito de uso persistido com shape inválido.");
        }

        return Result.ok(credit);
      },
      upsert: async (input: MeterCredit) => {
        const result = await runQuery("upsert meter credit", async () => {
          const rows = await db
            .insert(schema.billingMeterCredits)
            .values({
              id: input.id,
              meterId: input.meterId,
              customerId: input.customerId,
              granted: input.granted,
              consumed: input.consumed,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [schema.billingMeterCredits.meterId, schema.billingMeterCredits.customerId],
              set: {
                granted: input.granted,
                consumed: input.consumed,
                updatedAt: new Date(),
              },
            })
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Crédito de uso não foi persistido.");
        }

        const credit = mapMeterCredit(result.value);

        if (credit === null) {
          return invalidStoredRecord("Crédito de uso persistido com shape inválido.");
        }

        return Result.ok(credit);
      },
    },
  };
};
