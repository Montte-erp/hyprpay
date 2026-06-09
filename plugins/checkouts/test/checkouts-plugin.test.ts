import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import { checkouts } from "../src/checkouts-plugin";
import type { CheckoutDiscountPort } from "../src/contracts/checkouts-discount-port";
import type {
  CheckoutListFilter,
  CheckoutsDatabaseAdapter,
} from "../src/contracts/checkouts-database-adapter";
import type { CheckoutsProviderAdapter } from "../src/contracts/checkouts-provider-adapter";
import type { CatalogPriceLookupAdapter } from "@hyprpay/catalog";
import type { Price } from "../../catalog/src/schemas/price-schema";
import type { Checkout } from "../src/schemas/checkout-schema";

const basePrice: Price = {
  id: "price_fixed",
  productId: "prod_1",
  slug: "pro-monthly",
  amount: 5000,
  currency: "BRL",
  interval: "month",
  usageBased: false,
  priceType: "fixed",
  active: true,
  providerProductId: "prov_prod_1",
};

const customPrice: Price = {
  id: "price_custom",
  productId: "prod_2",
  slug: "support-us",
  amount: 1000,
  currency: "BRL",
  interval: "once",
  usageBased: false,
  priceType: "custom",
  minAmount: 500,
  active: true,
  providerProductId: "prov_prod_2",
};

const createCatalog = (prices: Price[]): CatalogPriceLookupAdapter => {
  const map = new Map(prices.map(price => [price.id, price]));

  return {
    prices: {
      create: async (input: Price) => {
        map.set(input.id, input);
        return Result.ok(input);
      },
      findById: async (id: string) => Result.ok(map.get(id) ?? null),
    },
  };
};

const createDatabase = (): CheckoutsDatabaseAdapter & { store: Map<string, Checkout> } => {
  const store = new Map<string, Checkout>();

  return {
    store,
    checkouts: {
      create: async (input: Checkout) => {
        store.set(input.id, input);
        return Result.ok(input);
      },
      findById: async (id: string) => Result.ok(store.get(id) ?? null),
      list: async (filter: CheckoutListFilter) => {
        const all = [...store.values()];
        const filtered = all.filter(checkout => {
          if (filter.customerId !== undefined && checkout.customerId !== filter.customerId) {
            return false;
          }

          if (
            filter.subscriptionId !== undefined &&
            checkout.subscriptionId !== filter.subscriptionId
          ) {
            return false;
          }

          return true;
        });

        return Result.ok(filtered);
      },
    },
  };
};

const createProvider = (): CheckoutsProviderAdapter => ({
  id: "fake",
  createCheckout: async input =>
    Result.ok({
      id: crypto.randomUUID(),
      providerCheckoutId: "prov_chk_1",
      customerId: input.customerId,
      priceId: input.priceId,
      methods: input.methods,
      url: "https://pay.example/session",
      // Provider echoes a possibly-wrong amount; the plugin overrides it with the
      // authoritative computed amount.
      amount: 99999,
      currency: "BRL",
      status: "pending",
      discountAmount: 0,
    }),
});

const createDiscountPort = (): CheckoutDiscountPort => ({
  get: async (id: string) =>
    id === "disc_1" ? Result.ok({ id: "disc_1", code: "SAVE10" }) : Result.ok(null),
  findByCode: async (code: string) =>
    code === "SAVE10" ? Result.ok({ id: "disc_1", code: "SAVE10" }) : Result.ok(null),
  apply: async ({ code, amount }) => {
    if (code !== "SAVE10") {
      return Result.ok({ discountAmount: 0, net: amount, discount: { id: "disc_x", code } });
    }

    // 10% off.
    const discountAmount = Math.round(amount * 0.1);
    return Result.ok({
      discountAmount,
      net: amount - discountAmount,
      discount: { id: "disc_1", code: "SAVE10" },
    });
  },
});

const buildPlugin = (overrides?: { discounts?: CheckoutDiscountPort; prices?: Price[] }) => {
  const database = createDatabase();
  const hyprpay = createHyprPay({
    plugins: [
      checkouts({
        database,
        catalog: createCatalog(overrides?.prices ?? [basePrice, customPrice]),
        provider: createProvider(),
        ...(overrides?.discounts !== undefined ? { discounts: overrides.discounts } : {}),
      }),
    ] as const,
  });

  return { hyprpay, database };
};

describe("@hyprpay/checkouts create", () => {
  it("uses the catalog price amount when no overrides are supplied", async () => {
    const { hyprpay } = buildPlugin();

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_fixed",
      methods: ["pix"],
    });

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) throw new Error("expected checkout");

    expect(result.value.amount).toBe(5000);
    expect(result.value.discountAmount).toBe(0);
  });

  it("applies a discount by code to the computed amount", async () => {
    const { hyprpay } = buildPlugin({ discounts: createDiscountPort() });

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_fixed",
      methods: ["pix"],
      discountCode: "SAVE10",
    });

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) throw new Error("expected checkout");

    expect(result.value.discountAmount).toBe(500);
    expect(result.value.amount).toBe(4500);
    expect(result.value.appliedDiscountId).toBe("disc_1");
  });

  it("resolves a discount by id then applies it", async () => {
    const { hyprpay } = buildPlugin({ discounts: createDiscountPort() });

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_fixed",
      methods: ["pix"],
      discountId: "disc_1",
    });

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) throw new Error("expected checkout");

    expect(result.value.amount).toBe(4500);
    expect(result.value.appliedDiscountId).toBe("disc_1");
  });

  it("rejects a discount when no discount port is configured", async () => {
    const { hyprpay } = buildPlugin();

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_fixed",
      methods: ["pix"],
      discountCode: "SAVE10",
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("404s when the discount id cannot be resolved", async () => {
    const { hyprpay } = buildPlugin({ discounts: createDiscountPort() });

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_fixed",
      methods: ["pix"],
      discountId: "missing",
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("collects custom fields and prefilled customer data", async () => {
    const { hyprpay } = buildPlugin();

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_fixed",
      methods: ["pix"],
      customFields: [{ key: "company_size", label: "Company size", value: "11-50" }],
      customer: { name: "Maria", email: "maria@example.com" },
    });

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) throw new Error("expected checkout");

    expect(result.value.customFields).toEqual([
      { key: "company_size", label: "Company size", value: "11-50" },
    ]);
    expect(result.value.customer?.email).toBe("maria@example.com");
  });

  it("honors a PWYW custom amount on a custom price", async () => {
    const { hyprpay } = buildPlugin();

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_custom",
      methods: ["pix"],
      customAmount: 2500,
    });

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) throw new Error("expected checkout");

    expect(result.value.amount).toBe(2500);
    expect(result.value.customAmount).toBe(2500);
  });

  it("rejects a custom amount below the price minimum", async () => {
    const { hyprpay } = buildPlugin();

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_custom",
      methods: ["pix"],
      customAmount: 100,
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("rejects a custom amount on a fixed price", async () => {
    const { hyprpay } = buildPlugin();

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_fixed",
      methods: ["pix"],
      customAmount: 2500,
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("carries trial selection and subscription upgrade context", async () => {
    const { hyprpay } = buildPlugin();

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_fixed",
      methods: ["card"],
      trialDays: 14,
      subscriptionId: "sub_1",
    });

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) throw new Error("expected checkout");

    expect(result.value.trialDays).toBe(14);
    expect(result.value.subscriptionId).toBe("sub_1");
  });

  it("combines a PWYW amount with a discount", async () => {
    const { hyprpay } = buildPlugin({ discounts: createDiscountPort() });

    const result = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_custom",
      methods: ["pix"],
      customAmount: 2000,
      discountCode: "SAVE10",
    });

    expect(Result.isOk(result)).toBe(true);
    if (Result.isError(result)) throw new Error("expected checkout");

    expect(result.value.discountAmount).toBe(200);
    expect(result.value.amount).toBe(1800);
  });
});

describe("@hyprpay/checkouts get + list", () => {
  it("retrieves a checkout by id and returns null for unknown ids", async () => {
    const { hyprpay } = buildPlugin();

    const created = await hyprpay.api.checkouts.create({
      customerId: "cust_1",
      priceId: "price_fixed",
      methods: ["pix"],
    });
    if (Result.isError(created)) throw new Error("expected checkout");

    const found = await hyprpay.api.checkouts.get(created.value.id);
    expect(Result.isOk(found)).toBe(true);
    if (Result.isError(found)) throw new Error("expected found");
    expect(found.value?.id).toBe(created.value.id);

    const missing = await hyprpay.api.checkouts.get("nope");
    expect(Result.isOk(missing)).toBe(true);
    if (Result.isError(missing)) throw new Error("expected missing ok");
    expect(missing.value).toBeNull();
  });

  it("lists checkouts filtered by customer and subscription", async () => {
    const { hyprpay } = buildPlugin();

    await hyprpay.api.checkouts.create({
      customerId: "cust_a",
      priceId: "price_fixed",
      methods: ["pix"],
    });
    await hyprpay.api.checkouts.create({
      customerId: "cust_b",
      priceId: "price_fixed",
      methods: ["pix"],
      subscriptionId: "sub_42",
    });

    const all = await hyprpay.api.checkouts.list();
    expect(Result.isOk(all)).toBe(true);
    if (Result.isError(all)) throw new Error("expected list");
    expect(all.value.length).toBe(2);

    const byCustomer = await hyprpay.api.checkouts.list({ customerId: "cust_a" });
    if (Result.isError(byCustomer)) throw new Error("expected list");
    expect(byCustomer.value.length).toBe(1);
    expect(byCustomer.value[0]?.customerId).toBe("cust_a");

    const bySub = await hyprpay.api.checkouts.list({ subscriptionId: "sub_42" });
    if (Result.isError(bySub)) throw new Error("expected list");
    expect(bySub.value.length).toBe(1);
    expect(bySub.value[0]?.subscriptionId).toBe("sub_42");
  });
});
