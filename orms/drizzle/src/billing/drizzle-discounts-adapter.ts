import { eq } from "drizzle-orm";
import { Result } from "better-result";
import type { BillingResult, Discount, DiscountsDatabaseAdapter } from "../discounts-plugin";
import { BillingError, billingErrors, discountSchema } from "../discounts-plugin";
import type { BillingPgDatabase } from "./drizzle-adapter";
import { billingSchema } from "./billing-schema";
import { drizzleQueryError } from "./errors/drizzle-errors";
import { billingDiscountDbInsertSchema } from "./zod/discount-schemas";

export interface DrizzleDiscountsAdapterOptions {
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

type DiscountRow = typeof billingSchema.billingDiscounts.$inferSelect;

const mapDiscount = (record: DiscountRow): Discount | null => {
  const parsed = discountSchema.safeParse({
    id: record.id,
    code: record.code,
    type: record.type,
    value: record.value,
    currency: record.currency,
    duration: record.duration,
    active: record.active,
    timesRedeemed: record.timesRedeemed,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    ...(record.durationInCycles !== null ? { durationInCycles: record.durationInCycles } : {}),
    ...(record.maxRedemptions !== null ? { maxRedemptions: record.maxRedemptions } : {}),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

export const drizzleDiscountsAdapter = (
  db: BillingPgDatabase,
  options: DrizzleDiscountsAdapterOptions = {},
): DiscountsDatabaseAdapter => {
  const schema = options.schema ?? billingSchema;

  return {
    discounts: {
      create: async (input: Discount) => {
        const discountToStore = billingDiscountDbInsertSchema.parse(input);
        const result = await runQuery("create discount", async () => {
          const rows = await db.insert(schema.billingDiscounts).values(discountToStore).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Cupom de desconto não foi persistido.");
        }

        const discount = mapDiscount(result.value);

        if (discount === null) {
          return invalidStoredRecord("Cupom de desconto persistido com shape inválido.");
        }

        return Result.ok(discount);
      },
      findById: async (id: string) => {
        const result = await runQuery("find discount", async () => {
          const rows = await db
            .select()
            .from(schema.billingDiscounts)
            .where(eq(schema.billingDiscounts.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const discount = mapDiscount(result.value);

        if (discount === null) {
          return invalidStoredRecord("Cupom de desconto persistido com shape inválido.");
        }

        return Result.ok(discount);
      },
      findByCode: async (code: string) => {
        const result = await runQuery("find discount by code", async () => {
          const rows = await db
            .select()
            .from(schema.billingDiscounts)
            .where(eq(schema.billingDiscounts.code, code))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const discount = mapDiscount(result.value);

        if (discount === null) {
          return invalidStoredRecord("Cupom de desconto persistido com shape inválido.");
        }

        return Result.ok(discount);
      },
      update: async (input: Discount) => {
        const result = await runQuery("update discount", async () => {
          const rows = await db
            .update(schema.billingDiscounts)
            .set({
              code: input.code,
              type: input.type,
              value: input.value,
              currency: input.currency,
              duration: input.duration,
              active: input.active,
              timesRedeemed: input.timesRedeemed,
              metadata: input.metadata ?? {},
              durationInCycles: input.durationInCycles ?? null,
              maxRedemptions: input.maxRedemptions ?? null,
            })
            .where(eq(schema.billingDiscounts.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Cupom de desconto não foi atualizado.");
        }

        const discount = mapDiscount(result.value);

        if (discount === null) {
          return invalidStoredRecord("Cupom de desconto persistido com shape inválido.");
        }

        return Result.ok(discount);
      },
      list: async () => {
        const result = await runQuery("list discounts", async () =>
          db.select().from(schema.billingDiscounts),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const discounts: Discount[] = [];

        for (const row of result.value) {
          const discount = mapDiscount(row);

          if (discount === null) {
            return invalidStoredRecord("Cupom de desconto persistido com shape inválido.");
          }

          discounts.push(discount);
        }

        return Result.ok(discounts);
      },
      delete: async (id: string) => {
        const result = await runQuery("delete discount", async () => {
          const rows = await db
            .delete(schema.billingDiscounts)
            .where(eq(schema.billingDiscounts.id, id))
            .returning({ id: schema.billingDiscounts.id });
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        return Result.ok(result.value !== null);
      },
    },
  };
};
