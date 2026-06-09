import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Result } from "better-result";
import { entitlementErrors } from "../entitlement-error-catalog";
import { EntitlementError } from "../entitlement-errors";
import type { EntitlementResult } from "../entitlement-result";
import type { EntitlementStore } from "../entitlement-store";
import {
  type EntitlementCheck,
  type EntitlementCheckInput,
  type EntitlementConsumeInput,
  type EntitlementGrant,
  entitlementCheckInputSchema,
  entitlementCheckSchema,
  entitlementConsumeInputSchema,
  entitlementGrantSchema,
} from "../entitlement-schema";
import { billingEntitlements } from "./billing-entitlements.table";

const entitlementDrizzleSchema = {
  billingEntitlements,
};

type EntitlementRow = typeof billingEntitlements.$inferSelect;

export interface DrizzleEntitlementsStoreOptions {
  schema?: typeof entitlementDrizzleSchema;
}

export type EntitlementsPgDatabase = PgDatabase<PgQueryResultHKT, typeof entitlementDrizzleSchema>;

const invalidInput = <T>() =>
  Result.err<T, EntitlementError>(
    new EntitlementError({
      error: entitlementErrors.INVALID_INPUT(),
      message: "Dados de entitlement inválidos.",
    }),
  );

const denied = <T>() =>
  Result.err<T, EntitlementError>(
    new EntitlementError({
      error: entitlementErrors.ENTITLEMENT_DENIED(),
      message: "Cliente não possui acesso a este recurso.",
    }),
  );

const invalidStoredRecord = <T>(message: string) =>
  Result.err<T, EntitlementError>(
    new EntitlementError({
      error: entitlementErrors.INVALID_INPUT(),
      message,
    }),
  );

const runQuery = async <TRow>(
  message: string,
  execute: () => Promise<TRow>,
): Promise<EntitlementResult<TRow>> =>
  Result.tryPromise({
    try: execute,
    catch: () =>
      new EntitlementError({
        error: entitlementErrors.INVALID_INPUT(),
        message,
      }),
  });

const firstRow = <TRow>(rows: TRow[]) => rows[0] ?? null;

const toCheck = (feature: string, limit: number | undefined, used: number): EntitlementResult<EntitlementCheck> => {
  const remaining = limit === undefined ? undefined : limit - used;
  const parsed = entitlementCheckSchema.safeParse({
    allowed: remaining === undefined ? true : remaining > 0,
    feature,
    ...(limit === undefined ? {} : { limit }),
    used,
    ...(remaining === undefined ? {} : { remaining }),
  });

  if (!parsed.success) {
    return invalidStoredRecord("Entitlement persistido com shape inválido.");
  }

  return Result.ok(parsed.data);
};

const loadEntitlement = async (
  db: EntitlementsPgDatabase,
  schema: typeof entitlementDrizzleSchema,
  customerId: string,
  feature: string,
) =>
  runQuery<EntitlementRow | null>("load entitlement", async () => {
    const rows = await db
      .select()
      .from(schema.billingEntitlements)
      .where(
        and(
          eq(schema.billingEntitlements.customerId, customerId),
          eq(schema.billingEntitlements.feature, feature),
        ),
      )
      .limit(1);

    return firstRow(rows);
  });

export const drizzleEntitlementsStore = (
  db: EntitlementsPgDatabase,
  options: DrizzleEntitlementsStoreOptions = {},
): EntitlementStore => {
  const schema = options.schema ?? entitlementDrizzleSchema;

  return {
    grant: async (input: EntitlementGrant) => {
      const parsed = entitlementGrantSchema.safeParse(input);

      if (!parsed.success) {
        return invalidInput();
      }

      const selectResult = await loadEntitlement(
        db,
        schema,
        parsed.data.customerId,
        parsed.data.feature,
      );

      if (Result.isError(selectResult)) {
        return Result.err(selectResult.error);
      }

      if (selectResult.value === null) {
        const insertResult = await runQuery<EntitlementRow | null>("create entitlement", async () => {
          const rows = await db
            .insert(schema.billingEntitlements)
            .values({
              id: crypto.randomUUID(),
              customerId: parsed.data.customerId,
              feature: parsed.data.feature,
              limit: parsed.data.limit,
              used: 0,
            })
            .returning();

          return firstRow(rows);
        });

        if (Result.isError(insertResult)) {
          return Result.err(insertResult.error);
        }

        if (insertResult.value === null) {
          return invalidStoredRecord("Entitlement não foi persistido.");
        }
      } else {
        const existingEntitlementId = selectResult.value.id;

        const updateResult = await runQuery<EntitlementRow | null>("reset entitlement", async () => {
          const rows = await db
            .update(schema.billingEntitlements)
            .set({
              limit: parsed.data.limit,
              used: 0,
              updatedAt: new Date(),
            })
            .where(eq(schema.billingEntitlements.id, existingEntitlementId))
            .returning();

          return firstRow(rows);
        });

        if (Result.isError(updateResult)) {
          return Result.err(updateResult.error);
        }

        if (updateResult.value === null) {
          return invalidStoredRecord("Entitlement não foi atualizado.");
        }
      }

      return toCheck(parsed.data.feature, parsed.data.limit, 0);
    },
    check: async (input: EntitlementCheckInput) => {
      const parsed = entitlementCheckInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidInput();
      }

      const result = await loadEntitlement(db, schema, parsed.data.customerId, parsed.data.feature);

      if (Result.isError(result)) {
        return Result.err(result.error);
      }

      if (result.value === null) {
        return Result.ok({
          allowed: false,
          feature: parsed.data.feature,
          used: 0,
        });
      }

      return toCheck(parsed.data.feature, result.value.limit ?? undefined, result.value.used);
    },
    consume: async (input: EntitlementConsumeInput) => {
      const parsed = entitlementConsumeInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidInput();
      }

      const selectResult = await loadEntitlement(
        db,
        schema,
        parsed.data.customerId,
        parsed.data.feature,
      );

      if (Result.isError(selectResult)) {
        return Result.err(selectResult.error);
      }

      if (selectResult.value === null) {
        return denied();
      }

      const nextUsed = selectResult.value.used + parsed.data.amount;

      if (selectResult.value.limit !== null && selectResult.value.limit !== undefined && nextUsed > selectResult.value.limit) {
        return denied();
      }

      const entitlementId = selectResult.value.id;

      const updateResult = await runQuery<EntitlementRow | null>("consume entitlement", async () => {
        const rows = await db
          .update(schema.billingEntitlements)
          .set({
            used: nextUsed,
            updatedAt: new Date(),
          })
          .where(eq(schema.billingEntitlements.id, entitlementId))
          .returning();

        return firstRow(rows);
      });

      if (Result.isError(updateResult)) {
        return Result.err(updateResult.error);
      }

      if (updateResult.value === null) {
        return invalidStoredRecord("Entitlement não foi atualizado.");
      }

      return toCheck(parsed.data.feature, updateResult.value.limit ?? undefined, updateResult.value.used);
    },
  };
};

export { billingEntitlements, entitlementDrizzleSchema };
