import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import { applyDiscount } from "@hyprpay/money";
import type {
  DiscountLookupAdapter,
  DiscountsDatabaseAdapter,
} from "./contracts/discounts-database-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type { Discount, DiscountInput } from "./schemas/discount-schema";
import {
  discountDurationSchema,
  discountInputSchema,
  discountSchema,
  discountTypeSchema,
} from "./schemas/discount-schema";
import { metadataSchema } from "./schemas/shared-schema";

/**
 * Mutable fields of a discount. `code`, `type` and `value` define the coupon's
 * identity and math, so they are immutable post-creation; everything else
 * (lifecycle, scheduling, scope, caps, metadata) can be patched.
 */
export interface DiscountUpdateInput {
  duration?: Discount["duration"];
  durationInCycles?: number;
  maxRedemptions?: number;
  startsAt?: string;
  endsAt?: string;
  restrictedToProductIds?: string[];
  active?: boolean;
  metadata?: Record<string, string>;
}

export interface DiscountsApi {
  create(input: DiscountInput): Promise<BillingResult<Discount>>;
  get(id: string): Promise<BillingResult<Discount | null>>;
  findByCode(code: string): Promise<BillingResult<Discount | null>>;
  list(): Promise<BillingResult<Discount[]>>;
  /**
   * Resolve a coupon by code, validate it against the current time, its active
   * flag, its redemption cap and the optional product scope, then apply its
   * discount math AND atomically increment `timesRedeemed`. Redemption counting
   * is integrated here so callers cannot under/over-count by forgetting a
   * separate redeem() call.
   */
  apply(input: {
    code: string;
    amount: number;
    productIds?: string[];
  }): Promise<BillingResult<{ discountAmount: number; net: number; discount: Discount }>>;
  update(id: string, patch: DiscountUpdateInput): Promise<BillingResult<Discount>>;
  delete(id: string): Promise<BillingResult<boolean>>;
  /**
   * @deprecated Prefer `apply`, which counts redemptions atomically. Retained
   * for back-compat; increments `timesRedeemed` for a discount looked up by id.
   */
  redeem(id: string): Promise<BillingResult<Discount>>;
}

export interface DiscountsPluginOptions {
  database: DiscountsDatabaseAdapter;
}

export type DiscountPluginEvent =
  | { type: "billing.discount.created"; payload: Discount }
  | { type: "billing.discount.redeemed"; payload: Discount };

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

const emitDiscountEvent = async (runtime: HyprPayRuntime, event: DiscountPluginEvent) => {
  await runtime.emit(event);
};

/**
 * Validate that a discount can be redeemed right now: it must be active, inside
 * its optional [startsAt, endsAt] window, not exhausted against its optional
 * `maxRedemptions`, and — when product-scoped — the requested products must all
 * be inside its `restrictedToProductIds` allow-list. Returns `Result.ok(true)`
 * when applicable, otherwise a typed `INVALID_INPUT` error.
 */
const assertDiscountApplicable = (
  discount: Discount,
  productIds?: string[],
): BillingResult<true> => {
  if (!discount.active) {
    return invalidBillingInput("Cupom de desconto inativo.");
  }

  const now = Date.now();

  if (discount.startsAt !== undefined) {
    const startsAt = Date.parse(discount.startsAt);

    if (Number.isNaN(startsAt)) {
      return invalidBillingInput("Janela de validade do cupom inválida.");
    }

    if (now < startsAt) {
      return invalidBillingInput("Cupom de desconto ainda não está válido.");
    }
  }

  if (discount.endsAt !== undefined) {
    const endsAt = Date.parse(discount.endsAt);

    if (Number.isNaN(endsAt)) {
      return invalidBillingInput("Janela de validade do cupom inválida.");
    }

    if (now > endsAt) {
      return invalidBillingInput("Cupom de desconto expirado.");
    }
  }

  if (discount.maxRedemptions !== undefined && discount.timesRedeemed >= discount.maxRedemptions) {
    return invalidBillingInput("Cupom de desconto esgotou o limite de resgates.");
  }

  const scope = discount.restrictedToProductIds;

  if (scope !== undefined && scope.length > 0) {
    if (productIds === undefined || productIds.length === 0) {
      return invalidBillingInput("Cupom de desconto restrito a produtos específicos.");
    }

    const allowed = new Set(scope);
    const everyAllowed = productIds.every(productId => allowed.has(productId));

    if (!everyAllowed) {
      return invalidBillingInput("Cupom de desconto não é válido para os produtos informados.");
    }
  }

  return Result.ok(true);
};

export const discounts = (
  options: DiscountsPluginOptions,
): HyprPayPlugin<"discounts", DiscountsApi> => ({
  id: "discounts",
  namespace: "discounts",
  extendApi: runtime => ({
    create: async (input: DiscountInput) => {
      const parsed = discountInputSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const discountResult = await options.database.discounts.create({
        id: crypto.randomUUID(),
        ...parsed.data,
        timesRedeemed: 0,
        createdAt: new Date().toISOString(),
      });

      if (Result.isError(discountResult)) {
        return Result.err(discountResult.error);
      }

      await emitDiscountEvent(runtime, {
        type: "billing.discount.created",
        payload: discountResult.value,
      });

      return discountResult;
    },
    get: async (id: string) => {
      return options.database.discounts.findById(id);
    },
    findByCode: async (code: string) => {
      return options.database.discounts.findByCode(code);
    },
    list: async () => {
      return options.database.discounts.list();
    },
    apply: async (input: { code: string; amount: number; productIds?: string[] }) => {
      if (typeof input.code !== "string" || input.code.length === 0) {
        return invalidBillingInput();
      }

      if (!Number.isInteger(input.amount) || input.amount < 0) {
        return invalidBillingInput("Valor do desconto inválido.");
      }

      const discountResult = await options.database.discounts.findByCode(input.code);

      if (Result.isError(discountResult)) {
        return Result.err(discountResult.error);
      }

      const discount = discountResult.value;

      if (discount === null) {
        return notFound("Cupom de desconto não encontrado.");
      }

      const eligibility = assertDiscountApplicable(discount, input.productIds);

      if (Result.isError(eligibility)) {
        return Result.err(eligibility.error);
      }

      // Atomically count the redemption together with the application so a
      // caller cannot under/over-count by forgetting a separate redeem().
      const redeemed: Discount = {
        ...discount,
        timesRedeemed: discount.timesRedeemed + 1,
      };

      const updatedResult = await options.database.discounts.update(redeemed);

      if (Result.isError(updatedResult)) {
        return Result.err(updatedResult.error);
      }

      const persisted = updatedResult.value;

      await emitDiscountEvent(runtime, {
        type: "billing.discount.redeemed",
        payload: persisted,
      });

      const { discountAmount, net } = applyDiscount(input.amount, {
        type: persisted.type,
        value: persisted.value,
      });

      return Result.ok({ discountAmount, net, discount: persisted });
    },
    update: async (id: string, patch: DiscountUpdateInput) => {
      if (typeof id !== "string" || id.length === 0) {
        return invalidBillingInput();
      }

      const existingResult = await options.database.discounts.findById(id);

      if (Result.isError(existingResult)) {
        return Result.err(existingResult.error);
      }

      const existing = existingResult.value;

      if (existing === null) {
        return notFound("Cupom de desconto não encontrado.");
      }

      // exactOptionalPropertyTypes: only spread keys that were actually provided
      // so we never assign `undefined` to an omitted optional prop.
      const next: Discount = {
        ...existing,
        ...(patch.duration !== undefined ? { duration: patch.duration } : {}),
        ...(patch.durationInCycles !== undefined
          ? { durationInCycles: patch.durationInCycles }
          : {}),
        ...(patch.maxRedemptions !== undefined ? { maxRedemptions: patch.maxRedemptions } : {}),
        ...(patch.startsAt !== undefined ? { startsAt: patch.startsAt } : {}),
        ...(patch.endsAt !== undefined ? { endsAt: patch.endsAt } : {}),
        ...(patch.restrictedToProductIds !== undefined
          ? { restrictedToProductIds: patch.restrictedToProductIds }
          : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
      };

      const parsed = discountSchema.safeParse(next);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      return options.database.discounts.update(parsed.data);
    },
    delete: async (id: string) => {
      if (typeof id !== "string" || id.length === 0) {
        return invalidBillingInput();
      }

      return options.database.discounts.delete(id);
    },
    redeem: async (id: string) => {
      if (typeof id !== "string" || id.length === 0) {
        return invalidBillingInput();
      }

      const discountResult = await options.database.discounts.findById(id);

      if (Result.isError(discountResult)) {
        return Result.err(discountResult.error);
      }

      const discount = discountResult.value;

      if (discount === null) {
        return notFound("Cupom de desconto não encontrado.");
      }

      const eligibility = assertDiscountApplicable(discount);

      if (Result.isError(eligibility)) {
        return Result.err(eligibility.error);
      }

      const redeemed: Discount = {
        ...discount,
        timesRedeemed: discount.timesRedeemed + 1,
      };

      const updatedResult = await options.database.discounts.update(redeemed);

      if (Result.isError(updatedResult)) {
        return Result.err(updatedResult.error);
      }

      await emitDiscountEvent(runtime, {
        type: "billing.discount.redeemed",
        payload: updatedResult.value,
      });

      return updatedResult;
    },
  }),
});

export type { BillingResult, DiscountLookupAdapter, DiscountsDatabaseAdapter };
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export {
  discountDurationSchema,
  discountInputSchema,
  discountSchema,
  discountTypeSchema,
};
export type { Discount, DiscountInput };
