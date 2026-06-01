import { Result } from "better-result";
import type { BillingResult } from "./adapter";
import { BillingError, billingErrors } from "./errors";
import {
  type EntitlementCheck,
  type EntitlementCheckInput,
  type EntitlementConsumeInput,
  type EntitlementGrant,
  entitlementCheckInputSchema,
  entitlementConsumeInputSchema,
  entitlementGrantSchema,
} from "./schemas";

const keyFor = (customerId: string, feature: string) => `${customerId}:${feature}`;

const invalidInput = <T>(): BillingResult<T> =>
  Result.err<T, BillingError>(
    new BillingError({
      error: billingErrors.INVALID_INPUT(),
      message: "Dados de entitlement inválidos.",
    }),
  );

export const createEntitlementStore = (initialGrants: EntitlementGrant[] = []) => {
  const entitlements = new Map<string, { limit: number | undefined; used: number }>();

  for (const grant of initialGrants) {
    entitlements.set(keyFor(grant.customerId, grant.feature), {
      limit: grant.limit,
      used: 0,
    });
  }

  return {
    grant(input: EntitlementGrant): BillingResult<EntitlementCheck> {
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
        limit: parsed.data.limit,
        used: 0,
        remaining: parsed.data.limit,
      });
    },
    check(input: EntitlementCheckInput): BillingResult<EntitlementCheck> {
      const parsed = entitlementCheckInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidInput();
      }

      const entitlement = entitlements.get(
        keyFor(parsed.data.customerId, parsed.data.feature),
      );

      if (!entitlement) {
        return Result.ok({
          allowed: false,
          feature: parsed.data.feature,
          used: 0,
        });
      }

      const remaining =
        entitlement.limit === undefined
          ? undefined
          : Math.max(entitlement.limit - entitlement.used, 0);

      return Result.ok({
        allowed: remaining === undefined || remaining > 0,
        feature: parsed.data.feature,
        limit: entitlement.limit,
        used: entitlement.used,
        remaining,
      });
    },
    consume(input: EntitlementConsumeInput): BillingResult<EntitlementCheck> {
      const parsed = entitlementConsumeInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidInput();
      }

      const entitlement = entitlements.get(
        keyFor(parsed.data.customerId, parsed.data.feature),
      );

      if (!entitlement) {
        return Result.err(
          new BillingError({
            error: billingErrors.ENTITLEMENT_DENIED(),
            message: "Cliente não possui acesso a este recurso.",
          }),
        );
      }

      const nextUsed = entitlement.used + parsed.data.amount;

      if (entitlement.limit !== undefined && nextUsed > entitlement.limit) {
        return Result.err(
          new BillingError({
            error: billingErrors.ENTITLEMENT_DENIED(),
            message: "Limite do recurso excedido.",
          }),
        );
      }

      entitlements.set(keyFor(parsed.data.customerId, parsed.data.feature), {
        limit: entitlement.limit,
        used: nextUsed,
      });

      return Result.ok({
        allowed: true,
        feature: parsed.data.feature,
        limit: entitlement.limit,
        used: nextUsed,
        remaining:
          entitlement.limit === undefined
            ? undefined
            : Math.max(entitlement.limit - nextUsed, 0),
      });
    },
  };
};
