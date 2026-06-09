import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import type { CatalogPriceLookupAdapter } from "@hyprpay/catalog";
import type {
  CheckoutsDatabaseAdapter,
  CheckoutListFilter,
  CheckoutLookupAdapter,
} from "./contracts/checkouts-database-adapter";
import type { CheckoutsProviderAdapter } from "./contracts/checkouts-provider-adapter";
import type {
  CheckoutDiscountApplication,
  CheckoutDiscountPort,
  CheckoutResolvedDiscount,
} from "./contracts/checkouts-discount-port";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type {
  Checkout,
  CheckoutCustomField,
  CheckoutCustomer,
  CheckoutInput,
} from "./schemas/checkout-schema";
import {
  checkoutCustomFieldSchema,
  checkoutCustomerSchema,
  checkoutInputSchema,
  checkoutSchema,
} from "./schemas/checkout-schema";
import { currencySchema, metadataSchema, paymentMethodSchema } from "./schemas/shared-schema";

export interface CheckoutsApi {
  create(input: CheckoutInput): Promise<BillingResult<Checkout>>;
  get(id: string): Promise<BillingResult<Checkout | null>>;
  list(filter?: CheckoutListFilter): Promise<BillingResult<Checkout[]>>;
}

export interface CheckoutsPluginOptions {
  database: CheckoutsDatabaseAdapter;
  catalog: CatalogPriceLookupAdapter;
  provider: CheckoutsProviderAdapter;
  /**
   * Optional discount resolver. Structurally compatible with the discounts
   * plugin's `DiscountsApi`. When omitted, supplying `discountId`/`discountCode`
   * at checkout is rejected as invalid input.
   */
  discounts?: CheckoutDiscountPort;
}

export type CheckoutPluginEvent =
  | { type: "billing.checkout.created"; payload: Checkout }
  | { type: "billing.checkout.completed"; payload: Checkout };

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

const providerMappingRequired = <T>(): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.PROVIDER_MAPPING_REQUIRED(),
      message: "O catálogo precisa do identificador do produto no provider.",
    }),
  );

const emitCheckoutEvent = async (runtime: HyprPayRuntime, event: CheckoutPluginEvent) => {
  await runtime.emit(event);
};

/**
 * Custom-pricing fields the catalog adds for PWYW prices. Read structurally so
 * checkout stays decoupled from the catalog's exact `Price` type evolution (the
 * fields land in catalog's published types when its dist is rebuilt centrally).
 */
interface CustomPricingFields {
  priceType?: string;
  minAmount?: number;
}

const readCustomPricing = (price: object): CustomPricingFields => price as CustomPricingFields;

/**
 * A price allows a custom (PWYW) amount when the catalog marks its `priceType` as
 * "custom" (see catalog custom-pricing lane).
 */
const priceAllowsCustomAmount = (price: object): boolean =>
  readCustomPricing(price).priceType === "custom";

interface ResolvedDiscount {
  application: CheckoutDiscountApplication;
}

/**
 * Resolves the discount referenced by the checkout input (by id or code) and
 * applies it to the gross amount. Returns `null` when no discount was requested.
 */
const resolveDiscount = async (
  discounts: CheckoutDiscountPort | undefined,
  input: { discountId?: string | undefined; discountCode?: string | undefined },
  grossAmount: number,
): Promise<BillingResult<ResolvedDiscount | null>> => {
  if (input.discountId === undefined && input.discountCode === undefined) {
    return Result.ok(null);
  }

  if (discounts === undefined) {
    return invalidBillingInput("Descontos não estão habilitados neste checkout.");
  }

  let code = input.discountCode;

  if (code === undefined && input.discountId !== undefined) {
    const discountResult = await discounts.get(input.discountId);

    if (Result.isError(discountResult)) {
      return Result.err(discountResult.error);
    }

    if (discountResult.value === null) {
      return notFound("Desconto não encontrado.");
    }

    code = discountResult.value.code;
  }

  if (code === undefined) {
    return invalidBillingInput("Código de desconto inválido.");
  }

  const applyResult = await discounts.apply({ code, amount: grossAmount });

  if (Result.isError(applyResult)) {
    return Result.err(applyResult.error);
  }

  return Result.ok({ application: applyResult.value });
};

export const checkouts = (options: CheckoutsPluginOptions): HyprPayPlugin<"checkouts", CheckoutsApi> => ({
  id: "checkouts",
  namespace: "checkouts",
  extendApi: runtime => ({
    create: async (input: CheckoutInput) => {
      const parsed = checkoutInputSchema.safeParse(input);

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

      const price = priceResult.value;
      const providerProductId = price.providerProductId ?? parsed.data.providerProductId;

      if (providerProductId === undefined) {
        return providerMappingRequired();
      }

      // Flexible pricing: honor a custom amount only when the price allows it.
      let grossAmount = price.amount;

      if (parsed.data.customAmount !== undefined) {
        if (!priceAllowsCustomAmount(price)) {
          return invalidBillingInput("Este preço não aceita valor personalizado.");
        }

        // Honor the catalog-defined floor for PWYW prices.
        const minAmount = readCustomPricing(price).minAmount;
        if (minAmount !== undefined && parsed.data.customAmount < minAmount) {
          return invalidBillingInput("Valor abaixo do mínimo permitido para este preço.");
        }

        grossAmount = parsed.data.customAmount;
      }

      // Discounts: resolve by id or code, then apply to the gross amount.
      const discountResult = await resolveDiscount(options.discounts, parsed.data, grossAmount);

      if (Result.isError(discountResult)) {
        return Result.err(discountResult.error);
      }

      const discountAmount = discountResult.value?.application.discountAmount ?? 0;
      const appliedDiscount: CheckoutResolvedDiscount | undefined =
        discountResult.value?.application.discount;
      const finalAmount = Math.max(0, grossAmount - discountAmount);

      const providerResult = await options.provider.createCheckout({
        ...parsed.data,
        providerProductId,
        amount: finalAmount,
      });

      if (Result.isError(providerResult)) {
        return Result.err(providerResult.error);
      }

      // The plugin owns the authoritative amount + discount + custom field data;
      // overlay them on top of whatever the provider echoed back.
      const enriched: Checkout = {
        ...providerResult.value,
        amount: finalAmount,
        discountAmount,
        ...(appliedDiscount !== undefined ? { appliedDiscountId: appliedDiscount.id } : {}),
        ...(parsed.data.customFields !== undefined
          ? { customFields: parsed.data.customFields }
          : {}),
        ...(parsed.data.customer !== undefined ? { customer: parsed.data.customer } : {}),
        ...(parsed.data.customAmount !== undefined
          ? { customAmount: parsed.data.customAmount }
          : {}),
        ...(parsed.data.trialDays !== undefined ? { trialDays: parsed.data.trialDays } : {}),
        ...(parsed.data.subscriptionId !== undefined
          ? { subscriptionId: parsed.data.subscriptionId }
          : {}),
        ...(parsed.data.discountId !== undefined ? { discountId: parsed.data.discountId } : {}),
        ...(parsed.data.discountCode !== undefined
          ? { discountCode: parsed.data.discountCode }
          : {}),
      };

      const validated = checkoutSchema.safeParse(enriched);

      if (!validated.success) {
        return Result.err(
          new BillingError({
            error: billingErrors.PROVIDER_RESPONSE_INVALID(),
            message: "Resposta inválida do provedor de pagamento.",
          }),
        );
      }

      const checkoutResult = await options.database.checkouts.create(validated.data);

      if (Result.isError(checkoutResult)) {
        return Result.err(checkoutResult.error);
      }

      await emitCheckoutEvent(runtime, {
        type: "billing.checkout.created",
        payload: checkoutResult.value,
      });

      return checkoutResult;
    },
    get: async (id: string) => {
      if (typeof id !== "string" || id.length === 0) {
        return invalidBillingInput("Identificador de checkout inválido.");
      }

      return options.database.checkouts.findById(id);
    },
    list: async (filter?: CheckoutListFilter) => {
      const normalized: CheckoutListFilter = {
        ...(filter?.customerId !== undefined ? { customerId: filter.customerId } : {}),
        ...(filter?.subscriptionId !== undefined ? { subscriptionId: filter.subscriptionId } : {}),
      };

      return options.database.checkouts.list(normalized);
    },
  }),
});

export type {
  BillingResult,
  CheckoutsDatabaseAdapter,
  CheckoutListFilter,
  CheckoutsProviderAdapter,
  CheckoutLookupAdapter,
  CheckoutDiscountPort,
  CheckoutDiscountApplication,
  CheckoutResolvedDiscount,
  CheckoutCustomField,
  CheckoutCustomer,
};
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export {
  checkoutInputSchema,
  checkoutSchema,
  checkoutCustomFieldSchema,
  checkoutCustomerSchema,
};
export type { Checkout, CheckoutInput };
export { currencySchema, metadataSchema, paymentMethodSchema };
