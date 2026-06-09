import { and, eq } from "drizzle-orm";
import { Result } from "better-result";
import type { BillingResult, Refund, RefundsDatabaseAdapter } from "../refunds-plugin";
import { BillingError, billingErrors, refundSchema } from "../refunds-plugin";
import type { BillingPgDatabase } from "./drizzle-adapter";
import { billingSchema } from "./billing-schema";
import { drizzleQueryError } from "./errors/drizzle-errors";
import { billingRefundDbInsertSchema } from "./zod/refund-schemas";

export interface DrizzleRefundsAdapterOptions {
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

type RefundRow = typeof billingSchema.billingRefunds.$inferSelect;

const mapRefund = (record: RefundRow): Refund | null => {
  const parsed = refundSchema.safeParse({
    id: record.id,
    orderId: record.orderId,
    amount: record.amount,
    currency: record.currency,
    reason: record.reason,
    status: record.status,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    ...(record.customerId !== null ? { customerId: record.customerId } : {}),
    ...(record.subscriptionId !== null ? { subscriptionId: record.subscriptionId } : {}),
    ...(record.providerRefundId !== null ? { providerRefundId: record.providerRefundId } : {}),
    ...(record.settledAt !== null ? { settledAt: record.settledAt } : {}),
    ...(record.updatedAt !== null ? { updatedAt: record.updatedAt } : {}),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

export const drizzleRefundsAdapter = (
  db: BillingPgDatabase,
  options: DrizzleRefundsAdapterOptions = {},
): RefundsDatabaseAdapter => {
  const schema = options.schema ?? billingSchema;

  return {
    refunds: {
      create: async (input: Refund) => {
        const refundToStore = billingRefundDbInsertSchema.parse(input);
        const result = await runQuery("create refund", async () => {
          const rows = await db.insert(schema.billingRefunds).values(refundToStore).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Reembolso não foi persistido.");
        }

        const refund = mapRefund(result.value);

        if (refund === null) {
          return invalidStoredRecord("Reembolso persistido com shape inválido.");
        }

        return Result.ok(refund);
      },
      findById: async (id: string) => {
        const result = await runQuery("find refund", async () => {
          const rows = await db
            .select()
            .from(schema.billingRefunds)
            .where(eq(schema.billingRefunds.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const refund = mapRefund(result.value);

        if (refund === null) {
          return invalidStoredRecord("Reembolso persistido com shape inválido.");
        }

        return Result.ok(refund);
      },
      update: async (input: Refund) => {
        const result = await runQuery("update refund", async () => {
          const rows = await db
            .update(schema.billingRefunds)
            .set({
              status: input.status,
              metadata: input.metadata ?? {},
              providerRefundId: input.providerRefundId ?? null,
              customerId: input.customerId ?? null,
              subscriptionId: input.subscriptionId ?? null,
              settledAt: input.settledAt ?? null,
              updatedAt: input.updatedAt ?? null,
            })
            .where(eq(schema.billingRefunds.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Reembolso não foi atualizado.");
        }

        const refund = mapRefund(result.value);

        if (refund === null) {
          return invalidStoredRecord("Reembolso persistido com shape inválido.");
        }

        return Result.ok(refund);
      },
      listByOrder: async (orderId: string) => {
        const result = await runQuery("list refunds by order", async () =>
          db.select().from(schema.billingRefunds).where(eq(schema.billingRefunds.orderId, orderId)),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const refunds: Refund[] = [];

        for (const row of result.value) {
          const refund = mapRefund(row);

          if (refund === null) {
            return invalidStoredRecord("Reembolso persistido com shape inválido.");
          }

          refunds.push(refund);
        }

        return Result.ok(refunds);
      },
      list: async (filter) => {
        const conditions = [
          ...(filter.orderId !== undefined ? [eq(schema.billingRefunds.orderId, filter.orderId)] : []),
          ...(filter.customerId !== undefined
            ? [eq(schema.billingRefunds.customerId, filter.customerId)]
            : []),
          ...(filter.subscriptionId !== undefined
            ? [eq(schema.billingRefunds.subscriptionId, filter.subscriptionId)]
            : []),
          ...(filter.status !== undefined ? [eq(schema.billingRefunds.status, filter.status)] : []),
        ];

        const result = await runQuery("list refunds", async () =>
          db.select().from(schema.billingRefunds).where(and(...conditions)),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const refunds: Refund[] = [];

        for (const row of result.value) {
          const refund = mapRefund(row);

          if (refund === null) {
            return invalidStoredRecord("Reembolso persistido com shape inválido.");
          }

          refunds.push(refund);
        }

        return Result.ok(filter.limit !== undefined ? refunds.slice(0, filter.limit) : refunds);
      },
    },
  };
};
