import { Result } from "better-result";
import { entitlementErrors } from "./entitlement-error-catalog";
import { EntitlementError } from "./entitlement-errors";
import type { EntitlementResult } from "./entitlement-result";
import type { EntitlementStore } from "./entitlement-store";
import {
  type EntitlementCheck,
  type EntitlementCheckInput,
  type EntitlementConsumeInput,
  type EntitlementGrant,
  type EntitlementRevokeInput,
  entitlementCheckInputSchema,
  entitlementConsumeInputSchema,
  entitlementGrantSchema,
  entitlementRevokeInputSchema,
} from "./entitlement-schema";

const keyFor = (customerId: string, feature: string) => `${customerId}:${feature}`;

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

export const createInMemoryEntitlementStore = (
  initialGrants: EntitlementGrant[] = [],
): EntitlementStore => {
  const entitlements = new Map<string, { limit: number | undefined; used: number }>();

  for (const grant of initialGrants) {
    entitlements.set(keyFor(grant.customerId, grant.feature), {
      limit: grant.limit,
      used: 0,
    });
  }

  return {
    grant(input: EntitlementGrant): EntitlementResult<EntitlementCheck> {
      const parsed = entitlementGrantSchema.safeParse(input);

      if (!parsed.success) {
        return invalidInput();
      }

      entitlements.set(keyFor(parsed.data.customerId, parsed.data.feature), {
        limit: parsed.data.limit,
        used: 0,
      });

      return Result.ok({
        allowed: true,
        feature: parsed.data.feature,
        ...(parsed.data.limit === undefined ? {} : { limit: parsed.data.limit }),
        used: 0,
        ...(parsed.data.limit === undefined ? {} : { remaining: parsed.data.limit }),
      });
    },
    check(input: EntitlementCheckInput): EntitlementResult<EntitlementCheck> {
      const parsed = entitlementCheckInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidInput();
      }

      const state = entitlements.get(keyFor(parsed.data.customerId, parsed.data.feature));

      if (state === undefined) {
        return Result.ok({
          allowed: false,
          feature: parsed.data.feature,
          used: 0,
        });
      }

      const remaining = state.limit === undefined ? undefined : state.limit - state.used;

      return Result.ok({
        allowed: remaining === undefined ? true : remaining > 0,
        feature: parsed.data.feature,
        ...(state.limit === undefined ? {} : { limit: state.limit }),
        used: state.used,
        ...(remaining === undefined ? {} : { remaining }),
      });
    },
    consume(input: EntitlementConsumeInput): EntitlementResult<EntitlementCheck> {
      const parsed = entitlementConsumeInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidInput();
      }

      const key = keyFor(parsed.data.customerId, parsed.data.feature);
      const state = entitlements.get(key);

      if (state === undefined) {
        return denied();
      }

      const nextUsed = state.used + parsed.data.amount;

      if (state.limit !== undefined && nextUsed > state.limit) {
        return denied();
      }

      entitlements.set(key, {
        limit: state.limit,
        used: nextUsed,
      });

      return Result.ok({
        allowed: true,
        feature: parsed.data.feature,
        ...(state.limit === undefined ? {} : { limit: state.limit }),
        used: nextUsed,
        ...(state.limit === undefined ? {} : { remaining: state.limit - nextUsed }),
      });
    },
    revoke(input: EntitlementRevokeInput): EntitlementResult<EntitlementCheck> {
      const parsed = entitlementRevokeInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidInput();
      }

      entitlements.delete(keyFor(parsed.data.customerId, parsed.data.feature));

      return Result.ok({
        allowed: false,
        feature: parsed.data.feature,
        used: 0,
      });
    },
  };
};
