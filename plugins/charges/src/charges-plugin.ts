/**
 * @hyprpay/charges — DEMOTED to a low-level payment detail.
 *
 * As of the billing-core rearchitecture, a charge is no longer the primary
 * financial record. It now represents a single low-level payment/attempt
 * detail captured from a payment provider. The authoritative financial record
 * is the order, owned by `@hyprpay/orders`, which supersedes charges as the
 * center of billing (totals, refunds, billing reason, line items).
 *
 * Prefer `@hyprpay/orders` for any new financial logic. This plugin is retained
 * for backward compatibility and provider-level payment bookkeeping only.
 *
 * NOTE: This is a documentation-only change. There is no behavioral change and
 * no change to the public API or exports of this module.
 */
import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import type { ChargeLookupAdapter, ChargesDatabaseAdapter } from "./contracts/charges-database-adapter";
import type { ChargesProviderAdapter } from "./contracts/charges-provider-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type { Charge, ChargeInput } from "./schemas/charge-schema";
import { chargeInputSchema, chargeSchema, chargeStatusSchema } from "./schemas/charge-schema";
import { currencySchema, metadataSchema, paymentMethodSchema } from "./schemas/shared-schema";

export interface ChargesApi {
  create(input: ChargeInput): Promise<BillingResult<Charge>>;
}

export interface ChargesPluginOptions {
  database: ChargesDatabaseAdapter;
  provider: ChargesProviderAdapter;
}

export type ChargePluginEvent =
  | { type: "billing.charge.created"; payload: Charge }
  | { type: "billing.charge.paid"; payload: Charge };

const invalidBillingInput = <T>(message = "Dados de billing inválidos."): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.INVALID_INPUT(),
      message,
    }),
  );

const emitChargeEvent = async (runtime: HyprPayRuntime, event: ChargePluginEvent) => {
  await runtime.emit(event);
};

export const charges = (options: ChargesPluginOptions): HyprPayPlugin<"charges", ChargesApi> => ({
  id: "charges",
  namespace: "charges",
  extendApi: runtime => ({
    create: async (input: ChargeInput) => {
      const parsed = chargeInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const providerResult = await options.provider.createCharge(parsed.data);

      if (Result.isError(providerResult)) {
        return Result.err(providerResult.error);
      }

      const chargeResult = await options.database.charges.create(providerResult.value);

      if (Result.isError(chargeResult)) {
        return Result.err(chargeResult.error);
      }

      await emitChargeEvent(runtime, {
        type: "billing.charge.created",
        payload: chargeResult.value,
      });

      return chargeResult;
    },
  }),
});

export type { BillingResult, ChargeLookupAdapter, ChargesDatabaseAdapter, ChargesProviderAdapter };
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export { chargeInputSchema, chargeSchema, chargeStatusSchema };
export type { Charge, ChargeInput };
export { currencySchema, metadataSchema, paymentMethodSchema };
