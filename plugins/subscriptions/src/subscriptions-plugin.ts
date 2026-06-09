import { Result } from "better-result";
import { prorate } from "@hyprpay/money";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import type { CatalogPriceLookupAdapter } from "@hyprpay/catalog";
import type {
  SubscriptionLookupAdapter,
  SubscriptionsDatabaseAdapter,
} from "./contracts/subscriptions-database-adapter";
import type { SubscriptionsProviderAdapter } from "./contracts/subscriptions-provider-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type {
  CancelSubscriptionInput,
  DunningConfig,
  ListSubscriptionsFilter,
  MarkPaymentFailedInput,
  ProrationResult,
  RecordUsageInput,
  RetryDunningInput,
  Subscription,
  SubscriptionInput,
  SubscriptionUpdateResult,
  UncancelSubscriptionInput,
  UpdateSubscriptionInput,
  UsageRecord,
} from "./schemas/subscription-schema";
import {
  cancelSubscriptionInputSchema,
  dunningConfigSchema,
  listSubscriptionsFilterSchema,
  markPaymentFailedInputSchema,
  prorationBehaviorSchema,
  prorationResultSchema,
  recordUsageInputSchema,
  retryDunningInputSchema,
  subscriptionInputSchema,
  subscriptionSchema,
  subscriptionStatusSchema,
  subscriptionUpdateResultSchema,
  uncancelSubscriptionInputSchema,
  updateSubscriptionInputSchema,
  usageRecordSchema,
} from "./schemas/subscription-schema";
import { billingIntervalSchema, metadataSchema, paymentMethodSchema } from "./schemas/shared-schema";

export interface SubscriptionsApi {
  create(input: SubscriptionInput): Promise<BillingResult<Subscription>>;
  get(id: string): Promise<BillingResult<Subscription | null>>;
  list(filter: ListSubscriptionsFilter): Promise<BillingResult<Subscription[]>>;
  update(input: UpdateSubscriptionInput): Promise<BillingResult<SubscriptionUpdateResult>>;
  cancel(input: CancelSubscriptionInput): Promise<BillingResult<Subscription>>;
  uncancel(input: UncancelSubscriptionInput): Promise<BillingResult<Subscription>>;
  markPaymentFailed(input: MarkPaymentFailedInput): Promise<BillingResult<Subscription>>;
  retry(input: RetryDunningInput): Promise<BillingResult<Subscription>>;
  recordUsage(input: RecordUsageInput): Promise<BillingResult<UsageRecord>>;
}

export interface SubscriptionsPluginOptions {
  database: SubscriptionsDatabaseAdapter;
  catalog: CatalogPriceLookupAdapter;
  provider: SubscriptionsProviderAdapter;
  /** Dunning policy applied to failed renewals. Defaults from `dunningConfigSchema`. */
  dunning?: Partial<DunningConfig>;
}

export type SubscriptionPluginEvent =
  | { type: "billing.subscription.created"; payload: Subscription }
  | {
      type: "billing.subscription.updated";
      payload: { subscription: Subscription; previous?: Subscription };
    }
  | { type: "billing.subscription.uncanceled"; payload: Subscription }
  | {
      type: "billing.subscription.payment_failed";
      payload: { subscription: Subscription; reason?: string };
    }
  | { type: "billing.subscription.recovered"; payload: Subscription }
  | { type: "billing.subscription.dunning_exhausted"; payload: Subscription };

const HOUR_MS = 60 * 60 * 1000;

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

const prorationNotApplicable = <T>(message: string): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.PRORATION_NOT_APPLICABLE(),
      message,
    }),
  );

const subscriptionNotCanceling = <T>(message: string): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.SUBSCRIPTION_NOT_CANCELING(),
      message,
    }),
  );

const invalidSubscriptionState = <T>(message: string): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.INVALID_SUBSCRIPTION_STATE(),
      message,
    }),
  );

const unsupportedCapability = <T>(providerId: string, capability: string): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.UNSUPPORTED_CAPABILITY(),
      message: `O provider ${providerId} não suporta ${capability}.`,
      provider: providerId,
    }),
  );

const providerMappingRequired = <T>(): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.PROVIDER_MAPPING_REQUIRED(),
      message: "O catálogo precisa do identificador do produto no provider.",
    }),
  );

const emitSubscriptionEvent = async (runtime: HyprPayRuntime, event: SubscriptionPluginEvent) => {
  await runtime.emit(event);
};

/**
 * Compute the proration credit/charge for swapping from `oldAmount` to
 * `newAmount` at `changeAt` within `[periodStart, periodEnd)`. Both the unused
 * remainder of the old price (credit) and the prorated remainder of the new
 * price (charge) are computed with @hyprpay/money's integer-centavos `prorate`.
 */
const computeProration = (input: {
  periodStart: string;
  periodEnd: string;
  changeAt: string;
  oldAmount: number;
  newAmount: number;
}): ProrationResult => {
  const creditAmount = prorate({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    changeAt: input.changeAt,
    amount: input.oldAmount,
  });
  const chargeAmount = prorate({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    changeAt: input.changeAt,
    amount: input.newAmount,
  });

  return {
    creditAmount,
    chargeAmount,
    netAmount: chargeAmount - creditAmount,
  };
};

/**
 * Advance a past_due subscription's dunning schedule one step. Returns the next
 * subscription state: either the next retry is scheduled, or — when retries are
 * exhausted and the grace window has elapsed — the subscription is canceled.
 */
const scheduleNextRetry = (
  subscription: Subscription,
  config: DunningConfig,
  now: number,
): { subscription: Subscription; exhausted: boolean } => {
  const attempt = subscription.dunningRetryCount;

  if (attempt < config.maxRetries) {
    const intervalHours =
      config.retryIntervalsHours[attempt] ??
      config.retryIntervalsHours[config.retryIntervalsHours.length - 1] ??
      24;
    const nextRetryAt = new Date(now + intervalHours * HOUR_MS).toISOString();

    return {
      subscription: {
        ...subscription,
        status: "past_due",
        dunningRetryCount: attempt + 1,
        nextRetryAt,
      },
      exhausted: false,
    };
  }

  // Retries exhausted: ensure a grace window, then cancel once it has elapsed.
  const graceEnds =
    subscription.graceEndsAt !== undefined ? Date.parse(subscription.graceEndsAt) : Number.NaN;

  if (Number.isNaN(graceEnds)) {
    const graceEndsAt = new Date(now + config.gracePeriodHours * HOUR_MS).toISOString();
    const nextState: Subscription = {
      ...subscription,
      status: "past_due",
      graceEndsAt,
    };
    delete (nextState as { nextRetryAt?: string }).nextRetryAt;
    return { subscription: nextState, exhausted: false };
  }

  if (now < graceEnds) {
    // Still inside grace: stay past_due, no further retry scheduled.
    const nextState: Subscription = { ...subscription, status: "past_due" };
    delete (nextState as { nextRetryAt?: string }).nextRetryAt;
    return { subscription: nextState, exhausted: false };
  }

  const canceledState: Subscription = {
    ...subscription,
    status: "canceled",
    canceledAt: new Date(now).toISOString(),
    endedAt: new Date(now).toISOString(),
    cancelAtPeriodEnd: false,
  };
  delete (canceledState as { nextRetryAt?: string }).nextRetryAt;
  return { subscription: canceledState, exhausted: true };
};

export const subscriptions = (
  options: SubscriptionsPluginOptions,
): HyprPayPlugin<"subscriptions", SubscriptionsApi> => {
  const dunningConfig = dunningConfigSchema.parse(options.dunning ?? {});

  return {
    id: "subscriptions",
    namespace: "subscriptions",
    extendApi: runtime => ({
      create: async (input: SubscriptionInput) => {
        const parsed = subscriptionInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const priceResult = await options.catalog.prices.findById(parsed.data.priceId);

        if (Result.isError(priceResult)) {
          return Result.err(priceResult.error);
        }

        if (priceResult.value === null) {
          return notFound("Preço de billing não encontrado.");
        }

        const providerProductId = priceResult.value.providerProductId ?? parsed.data.providerProductId;

        if (providerProductId === undefined) {
          return providerMappingRequired();
        }

        const providerResult = await options.provider.createSubscription({
          ...parsed.data,
          providerProductId,
        });

        if (Result.isError(providerResult)) {
          return Result.err(providerResult.error);
        }

        // Carry discount references the provider may have dropped: discounts are
        // a HyprPay-side concern (stored, not sent to the provider).
        const withDiscount: Subscription = {
          ...providerResult.value,
          ...(parsed.data.discountId !== undefined && providerResult.value.discountId === undefined
            ? { discountId: parsed.data.discountId }
            : {}),
          ...(parsed.data.discountCode !== undefined &&
          providerResult.value.discountCode === undefined
            ? { discountCode: parsed.data.discountCode }
            : {}),
        };

        const subscriptionResult = await options.database.subscriptions.create(withDiscount);

        if (Result.isError(subscriptionResult)) {
          return Result.err(subscriptionResult.error);
        }

        await emitSubscriptionEvent(runtime, {
          type: "billing.subscription.created",
          payload: subscriptionResult.value,
        });

        return subscriptionResult;
      },
      get: async (id: string) => options.database.subscriptions.findById(id),
      list: async (filter: ListSubscriptionsFilter) => {
        const parsed = listSubscriptionsFilterSchema.safeParse(filter);

        if (!parsed.success) {
          return invalidBillingInput("Filtro de listagem inválido.");
        }

        return options.database.subscriptions.list(parsed.data);
      },
      update: async (input: UpdateSubscriptionInput) => {
        const parsed = updateSubscriptionInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const existingResult = await options.database.subscriptions.findById(
          parsed.data.subscriptionId,
        );

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound("Assinatura de billing não encontrada.");
        }

        const existing = existingResult.value;
        let proration: ProrationResult | undefined;
        let nextSubscription: Subscription = { ...existing };

        // Discount changes are HyprPay-side only — accept + store.
        if (parsed.data.discountId !== undefined) {
          nextSubscription = { ...nextSubscription, discountId: parsed.data.discountId };
        }
        if (parsed.data.discountCode !== undefined) {
          nextSubscription = { ...nextSubscription, discountCode: parsed.data.discountCode };
        }
        if (parsed.data.metadata !== undefined) {
          nextSubscription = { ...nextSubscription, metadata: parsed.data.metadata };
        }

        if (parsed.data.priceId !== undefined && parsed.data.priceId !== existing.priceId) {
          const newPriceResult = await options.catalog.prices.findById(parsed.data.priceId);

          if (Result.isError(newPriceResult)) {
            return Result.err(newPriceResult.error);
          }

          if (newPriceResult.value === null) {
            return notFound("Preço de billing não encontrado.");
          }

          const behavior = parsed.data.prorationBehavior;

          if (behavior === "prorate") {
            const oldPriceResult = await options.catalog.prices.findById(existing.priceId);

            if (Result.isError(oldPriceResult)) {
              return Result.err(oldPriceResult.error);
            }

            if (oldPriceResult.value === null) {
              return notFound("Preço atual da assinatura não encontrado.");
            }

            if (
              existing.currentPeriodStart === undefined ||
              existing.currentPeriodEnd === undefined
            ) {
              return prorationNotApplicable(
                "A assinatura não possui um período de cobrança definido para rateio.",
              );
            }

            const changeAt = new Date().toISOString();

            try {
              proration = computeProration({
                periodStart: existing.currentPeriodStart,
                periodEnd: existing.currentPeriodEnd,
                changeAt,
                oldAmount: oldPriceResult.value.amount,
                newAmount: newPriceResult.value.amount,
              });
            } catch {
              return prorationNotApplicable(
                "Não foi possível calcular o rateio para a alteração de plano.",
              );
            }

            nextSubscription = { ...nextSubscription, priceId: parsed.data.priceId };
          } else if (behavior === "none") {
            // Immediate swap, no proration adjustment.
            nextSubscription = { ...nextSubscription, priceId: parsed.data.priceId };
          } else {
            // next_period: keep current price until the period rolls over.
            // Record the target via metadata so the renewal can pick it up.
            nextSubscription = {
              ...nextSubscription,
              metadata: {
                ...(nextSubscription.metadata ?? {}),
                pendingPriceId: parsed.data.priceId,
              },
            };
          }
        }

        const updatedResult = await options.database.subscriptions.update(nextSubscription);

        if (Result.isError(updatedResult)) {
          return Result.err(updatedResult.error);
        }

        await emitSubscriptionEvent(runtime, {
          type: "billing.subscription.updated",
          payload: { subscription: updatedResult.value, previous: existing },
        });

        const updateResult: SubscriptionUpdateResult = {
          subscription: updatedResult.value,
          ...(proration !== undefined ? { proration } : {}),
        };

        return Result.ok(updateResult);
      },
      cancel: async (input: CancelSubscriptionInput) => {
        const parsed = cancelSubscriptionInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        if (options.provider.cancelSubscription === undefined) {
          return unsupportedCapability(options.provider.id, "cancelamento de assinatura");
        }

        const existingResult = await options.database.subscriptions.findById(
          parsed.data.subscriptionId,
        );

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        const providerResult = await options.provider.cancelSubscription(parsed.data);

        if (Result.isError(providerResult)) {
          return Result.err(providerResult.error);
        }

        const nextSubscription =
          existingResult.value === null
            ? providerResult.value
            : {
                ...existingResult.value,
                ...providerResult.value,
                priceId:
                  providerResult.value.priceId.length > 0
                    ? providerResult.value.priceId
                    : existingResult.value.priceId,
                metadata:
                  providerResult.value.metadata !== undefined &&
                  Object.keys(providerResult.value.metadata).length > 0
                    ? providerResult.value.metadata
                    : existingResult.value.metadata,
              };

        const subscriptionResult = await options.database.subscriptions.update(nextSubscription);

        if (Result.isError(subscriptionResult)) {
          return Result.err(subscriptionResult.error);
        }

        await emitSubscriptionEvent(runtime, {
          type: "billing.subscription.updated",
          payload:
            existingResult.value === null
              ? { subscription: subscriptionResult.value }
              : { subscription: subscriptionResult.value, previous: existingResult.value },
        });

        return subscriptionResult;
      },
      uncancel: async (input: UncancelSubscriptionInput) => {
        const parsed = uncancelSubscriptionInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const existingResult = await options.database.subscriptions.findById(
          parsed.data.subscriptionId,
        );

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound("Assinatura de billing não encontrada.");
        }

        const existing = existingResult.value;

        // Uncancel only reverses a pending cancel-at-period-end intent; it does
        // not resurrect an already terminated subscription.
        if (existing.status === "canceled" || existing.status === "expired") {
          return invalidSubscriptionState(
            "A assinatura já foi encerrada e não pode ser reativada por uncancel.",
          );
        }

        if (!existing.cancelAtPeriodEnd) {
          return subscriptionNotCanceling(
            "A assinatura não está agendada para cancelamento ao fim do período.",
          );
        }

        const reactivated: Subscription = {
          ...existing,
          cancelAtPeriodEnd: false,
        };
        delete (reactivated as { canceledAt?: string }).canceledAt;

        const updatedResult = await options.database.subscriptions.update(reactivated);

        if (Result.isError(updatedResult)) {
          return Result.err(updatedResult.error);
        }

        await emitSubscriptionEvent(runtime, {
          type: "billing.subscription.uncanceled",
          payload: updatedResult.value,
        });

        return updatedResult;
      },
      markPaymentFailed: async (input: MarkPaymentFailedInput) => {
        const parsed = markPaymentFailedInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const existingResult = await options.database.subscriptions.findById(
          parsed.data.subscriptionId,
        );

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound("Assinatura de billing não encontrada.");
        }

        const existing = existingResult.value;

        if (existing.status === "canceled" || existing.status === "expired") {
          return invalidSubscriptionState(
            "Não é possível iniciar dunning em uma assinatura encerrada.",
          );
        }

        const failedAt = parsed.data.failedAt ?? new Date().toISOString();
        const now = Date.parse(failedAt);
        const baseNow = Number.isNaN(now) ? Date.now() : now;

        const intervalHours = dunningConfig.retryIntervalsHours[0] ?? 24;
        const firstRetryAt =
          dunningConfig.maxRetries > 0
            ? new Date(baseNow + intervalHours * HOUR_MS).toISOString()
            : undefined;

        const pastDue: Subscription = {
          ...existing,
          status: "past_due",
          pastDueAt: existing.pastDueAt ?? failedAt,
          dunningRetryCount: 0,
          ...(firstRetryAt !== undefined ? { nextRetryAt: firstRetryAt } : {}),
          ...(parsed.data.reason !== undefined ? { lastPaymentError: parsed.data.reason } : {}),
        };

        // If no retries are configured, set the grace window immediately.
        if (dunningConfig.maxRetries === 0) {
          pastDue.graceEndsAt = new Date(
            baseNow + dunningConfig.gracePeriodHours * HOUR_MS,
          ).toISOString();
        }

        const updatedResult = await options.database.subscriptions.update(pastDue);

        if (Result.isError(updatedResult)) {
          return Result.err(updatedResult.error);
        }

        await emitSubscriptionEvent(runtime, {
          type: "billing.subscription.payment_failed",
          payload: {
            subscription: updatedResult.value,
            ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
          },
        });

        return updatedResult;
      },
      retry: async (input: RetryDunningInput) => {
        const parsed = retryDunningInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const existingResult = await options.database.subscriptions.findById(
          parsed.data.subscriptionId,
        );

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound("Assinatura de billing não encontrada.");
        }

        const existing = existingResult.value;

        if (existing.status !== "past_due") {
          return invalidSubscriptionState(
            "A assinatura não está em dunning (past_due); nada a reprocessar.",
          );
        }

        const attemptedAt = parsed.data.attemptedAt ?? new Date().toISOString();
        const parsedNow = Date.parse(attemptedAt);
        const now = Number.isNaN(parsedNow) ? Date.now() : parsedNow;

        // Successful retry: recover the subscription back to active.
        if (parsed.data.succeeded) {
          const recovered: Subscription = {
            ...existing,
            status: "active",
            dunningRetryCount: 0,
          };
          delete (recovered as { pastDueAt?: string }).pastDueAt;
          delete (recovered as { nextRetryAt?: string }).nextRetryAt;
          delete (recovered as { graceEndsAt?: string }).graceEndsAt;
          delete (recovered as { lastPaymentError?: string }).lastPaymentError;

          const updatedResult = await options.database.subscriptions.update(recovered);

          if (Result.isError(updatedResult)) {
            return Result.err(updatedResult.error);
          }

          await emitSubscriptionEvent(runtime, {
            type: "billing.subscription.recovered",
            payload: updatedResult.value,
          });

          return updatedResult;
        }

        // Failed retry: advance the dunning schedule (or cancel if exhausted).
        const { subscription: nextState, exhausted } = scheduleNextRetry(
          existing,
          dunningConfig,
          now,
        );

        const updatedResult = await options.database.subscriptions.update(nextState);

        if (Result.isError(updatedResult)) {
          return Result.err(updatedResult.error);
        }

        if (exhausted) {
          await emitSubscriptionEvent(runtime, {
            type: "billing.subscription.dunning_exhausted",
            payload: updatedResult.value,
          });
        } else {
          await emitSubscriptionEvent(runtime, {
            type: "billing.subscription.updated",
            payload: { subscription: updatedResult.value, previous: existing },
          });
        }

        return updatedResult;
      },
      recordUsage: async (input: RecordUsageInput) => {
        const parsed = recordUsageInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        if (options.provider.recordUsage === undefined) {
          return unsupportedCapability(options.provider.id, "registro de uso");
        }

        return options.provider.recordUsage(parsed.data);
      },
    }),
  };
};

export type {
  BillingResult,
  SubscriptionLookupAdapter,
  SubscriptionsDatabaseAdapter,
  SubscriptionsProviderAdapter,
};
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export {
  cancelSubscriptionInputSchema,
  dunningConfigSchema,
  listSubscriptionsFilterSchema,
  markPaymentFailedInputSchema,
  prorationBehaviorSchema,
  prorationResultSchema,
  recordUsageInputSchema,
  retryDunningInputSchema,
  subscriptionInputSchema,
  subscriptionSchema,
  subscriptionStatusSchema,
  subscriptionUpdateResultSchema,
  uncancelSubscriptionInputSchema,
  updateSubscriptionInputSchema,
  usageRecordSchema,
};
export type {
  CancelSubscriptionInput,
  DunningConfig,
  ListSubscriptionsFilter,
  MarkPaymentFailedInput,
  ProrationBehavior,
  ProrationResult,
  RecordUsageInput,
  RetryDunningInput,
  Subscription,
  SubscriptionInput,
  SubscriptionStatus,
  SubscriptionUpdateResult,
  UncancelSubscriptionInput,
  UpdateSubscriptionInput,
  UsageRecord,
} from "./schemas/subscription-schema";
export { billingIntervalSchema, metadataSchema, paymentMethodSchema };
