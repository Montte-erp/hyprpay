import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import { catalog } from "../src/catalog-plugin";
import type { CatalogDatabaseAdapter } from "../src/contracts/catalog-database-adapter";
import type { Price, PriceListFilter } from "../src/schemas/price-schema";
import type { Product, ProductListFilter } from "../src/schemas/product-schema";

const createInMemoryCatalogDatabase = (): CatalogDatabaseAdapter => {
  const products = new Map<string, Product>();
  const prices = new Map<string, Price>();

  return {
    products: {
      create: async (input: Product) => {
        products.set(input.id, input);
        return Result.ok(input);
      },
      findById: async (id: string) => Result.ok(products.get(id) ?? null),
      list: async (filter: ProductListFilter) => {
        let rows = Array.from(products.values());

        if (filter.active !== undefined) {
          rows = rows.filter(row => row.active === filter.active);
        }

        if (filter.slug !== undefined) {
          rows = rows.filter(row => row.slug === filter.slug);
        }

        const offset = filter.offset ?? 0;
        const end = filter.limit !== undefined ? offset + filter.limit : undefined;

        return Result.ok(rows.slice(offset, end));
      },
      update: async (input: Product) => {
        products.set(input.id, input);
        return Result.ok(input);
      },
    },
    prices: {
      create: async (input: Price) => {
        prices.set(input.id, input);
        return Result.ok(input);
      },
      findById: async (id: string) => Result.ok(prices.get(id) ?? null),
      list: async (filter: PriceListFilter) => {
        let rows = Array.from(prices.values());

        if (filter.productId !== undefined) {
          rows = rows.filter(row => row.productId === filter.productId);
        }

        if (filter.active !== undefined) {
          rows = rows.filter(row => row.active === filter.active);
        }

        const offset = filter.offset ?? 0;
        const end = filter.limit !== undefined ? offset + filter.limit : undefined;

        return Result.ok(rows.slice(offset, end));
      },
      update: async (input: Price) => {
        prices.set(input.id, input);
        return Result.ok(input);
      },
    },
  };
};

const setup = () => {
  const database = createInMemoryCatalogDatabase();
  const hyprpay = createHyprPay({
    plugins: [catalog({ database })] as const,
  });

  return hyprpay;
};

const createProduct = async (hyprpay: ReturnType<typeof setup>, slug = "starter") => {
  const result = await hyprpay.api.catalog.products.create({
    slug,
    name: "Starter plan",
  });

  if (Result.isError(result)) {
    throw new Error("expected product creation to succeed");
  }

  return result.value;
};

describe("@hyprpay/catalog pricing modes", () => {
  it("allows FREE pricing (amount = 0)", async () => {
    const hyprpay = setup();
    const product = await createProduct(hyprpay);

    const result = await hyprpay.api.catalog.prices.create({
      productId: product.id,
      slug: "free",
      amount: 0,
      interval: "month",
    });

    expect(Result.isOk(result)).toBe(true);

    if (Result.isError(result)) {
      throw new Error("expected free price creation to succeed");
    }

    expect(result.value.amount).toBe(0);
    expect(result.value.priceType).toBe("fixed");
  });

  it("rejects negative amounts", async () => {
    const hyprpay = setup();
    const product = await createProduct(hyprpay);

    const result = await hyprpay.api.catalog.prices.create({
      productId: product.id,
      slug: "negative",
      amount: -100,
      interval: "month",
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("supports pay-what-you-want / custom pricing with min + preset", async () => {
    const hyprpay = setup();
    const product = await createProduct(hyprpay);

    const result = await hyprpay.api.catalog.prices.create({
      productId: product.id,
      slug: "pwyw",
      amount: 0,
      interval: "once",
      priceType: "custom",
      minAmount: 500,
      presetAmount: 1500,
    });

    expect(Result.isOk(result)).toBe(true);

    if (Result.isError(result)) {
      throw new Error("expected custom price creation to succeed");
    }

    expect(result.value.priceType).toBe("custom");
    expect(result.value.minAmount).toBe(500);
    expect(result.value.presetAmount).toBe(1500);
  });

  it("rejects custom pricing where minAmount exceeds presetAmount", async () => {
    const hyprpay = setup();
    const product = await createProduct(hyprpay);

    const result = await hyprpay.api.catalog.prices.create({
      productId: product.id,
      slug: "pwyw-bad",
      amount: 0,
      interval: "once",
      priceType: "custom",
      minAmount: 2000,
      presetAmount: 1000,
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("rejects custom pricing fields on a fixed price", async () => {
    const hyprpay = setup();
    const product = await createProduct(hyprpay);

    const result = await hyprpay.api.catalog.prices.create({
      productId: product.id,
      slug: "fixed-with-min",
      amount: 1000,
      interval: "month",
      priceType: "fixed",
      minAmount: 500,
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("binds metered pricing to a meter with a unit amount", async () => {
    const hyprpay = setup();
    const product = await createProduct(hyprpay);

    const result = await hyprpay.api.catalog.prices.create({
      productId: product.id,
      slug: "usage",
      amount: 0,
      interval: "month",
      usageBased: true,
      billingStrategy: "metered",
      meterId: "meter_abc",
      unitAmount: 25,
    });

    expect(Result.isOk(result)).toBe(true);

    if (Result.isError(result)) {
      throw new Error("expected metered price creation to succeed");
    }

    expect(result.value.meterId).toBe("meter_abc");
    expect(result.value.unitAmount).toBe(25);
  });
});

describe("@hyprpay/catalog product CRUD", () => {
  it("reads a product by id", async () => {
    const hyprpay = setup();
    const product = await createProduct(hyprpay);

    const result = await hyprpay.api.catalog.products.get(product.id);

    expect(Result.isOk(result)).toBe(true);

    if (Result.isError(result)) {
      throw new Error("expected product lookup to succeed");
    }

    expect(result.value?.id).toBe(product.id);
  });

  it("returns null when reading a missing product", async () => {
    const hyprpay = setup();

    const result = await hyprpay.api.catalog.products.get("missing");

    if (Result.isError(result)) {
      throw new Error("expected product lookup to succeed");
    }

    expect(result.value).toBeNull();
  });

  it("lists products with an active filter", async () => {
    const hyprpay = setup();
    await createProduct(hyprpay, "one");
    const second = await createProduct(hyprpay, "two");
    await hyprpay.api.catalog.products.archive(second.id);

    const activeResult = await hyprpay.api.catalog.products.list({ active: true });

    if (Result.isError(activeResult)) {
      throw new Error("expected product list to succeed");
    }

    expect(activeResult.value).toHaveLength(1);
    expect(activeResult.value[0]?.slug).toBe("one");
  });

  it("lists all products when no filter is provided", async () => {
    const hyprpay = setup();
    await createProduct(hyprpay, "a");
    await createProduct(hyprpay, "b");

    const result = await hyprpay.api.catalog.products.list();

    if (Result.isError(result)) {
      throw new Error("expected product list to succeed");
    }

    expect(result.value).toHaveLength(2);
  });

  it("updates a product without clobbering omitted fields", async () => {
    const hyprpay = setup();
    const product = await createProduct(hyprpay);

    const result = await hyprpay.api.catalog.products.update(product.id, {
      name: "Renamed plan",
    });

    if (Result.isError(result)) {
      throw new Error("expected product update to succeed");
    }

    expect(result.value.name).toBe("Renamed plan");
    // active was true and not part of the patch — must stay true.
    expect(result.value.active).toBe(true);
    expect(result.value.slug).toBe(product.slug);
  });

  it("fails to update a missing product", async () => {
    const hyprpay = setup();

    const result = await hyprpay.api.catalog.products.update("missing", { name: "x" });

    expect(Result.isError(result)).toBe(true);
  });

  it("archives a product (soft delete)", async () => {
    const hyprpay = setup();
    const product = await createProduct(hyprpay);

    const result = await hyprpay.api.catalog.products.archive(product.id);

    if (Result.isError(result)) {
      throw new Error("expected product archive to succeed");
    }

    expect(result.value.active).toBe(false);
  });
});

describe("@hyprpay/catalog price CRUD", () => {
  const createPrice = async (hyprpay: ReturnType<typeof setup>) => {
    const product = await createProduct(hyprpay);
    const result = await hyprpay.api.catalog.prices.create({
      productId: product.id,
      slug: "monthly",
      amount: 1990,
      interval: "month",
    });

    if (Result.isError(result)) {
      throw new Error("expected price creation to succeed");
    }

    return result.value;
  };

  it("reads a price by id", async () => {
    const hyprpay = setup();
    const price = await createPrice(hyprpay);

    const result = await hyprpay.api.catalog.prices.get(price.id);

    if (Result.isError(result)) {
      throw new Error("expected price lookup to succeed");
    }

    expect(result.value?.id).toBe(price.id);
  });

  it("lists prices scoped to a product", async () => {
    const hyprpay = setup();
    const price = await createPrice(hyprpay);

    const result = await hyprpay.api.catalog.prices.list({ productId: price.productId });

    if (Result.isError(result)) {
      throw new Error("expected price list to succeed");
    }

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.id).toBe(price.id);
  });

  it("updates a price amount without resetting other fields", async () => {
    const hyprpay = setup();
    const price = await createPrice(hyprpay);

    const result = await hyprpay.api.catalog.prices.update(price.id, { amount: 2990 });

    if (Result.isError(result)) {
      throw new Error("expected price update to succeed");
    }

    expect(result.value.amount).toBe(2990);
    // active was true and not part of the patch — must stay true.
    expect(result.value.active).toBe(true);
    expect(result.value.priceType).toBe("fixed");
    expect(result.value.slug).toBe(price.slug);
  });

  it("rejects a price update that drops the amount below zero", async () => {
    const hyprpay = setup();
    const price = await createPrice(hyprpay);

    const result = await hyprpay.api.catalog.prices.update(price.id, { amount: -1 });

    expect(Result.isError(result)).toBe(true);
  });

  it("archives a price (soft delete)", async () => {
    const hyprpay = setup();
    const price = await createPrice(hyprpay);

    const result = await hyprpay.api.catalog.prices.archive(price.id);

    if (Result.isError(result)) {
      throw new Error("expected price archive to succeed");
    }

    expect(result.value.active).toBe(false);
  });

  it("fails to create a price for a missing product", async () => {
    const hyprpay = setup();

    const result = await hyprpay.api.catalog.prices.create({
      productId: "missing",
      slug: "orphan",
      amount: 100,
      interval: "month",
    });

    expect(Result.isError(result)).toBe(true);
  });
});

describe("@hyprpay/catalog events", () => {
  it("emits lifecycle events through the runtime", async () => {
    const database = createInMemoryCatalogDatabase();
    const seen: string[] = [];

    const hyprpay = createHyprPay({
      plugins: [
        catalog({ database }),
        {
          id: "event-spy",
          namespace: "eventSpy",
          hooks: {
            onEvent: async event => {
              seen.push(event.type);
            },
          },
        },
      ] as const,
    });

    const productResult = await hyprpay.api.catalog.products.create({
      slug: "events",
      name: "Events plan",
    });

    if (Result.isError(productResult)) {
      throw new Error("expected product creation to succeed");
    }

    await hyprpay.api.catalog.products.update(productResult.value.id, { name: "Renamed" });
    await hyprpay.api.catalog.products.archive(productResult.value.id);

    const priceResult = await hyprpay.api.catalog.prices.create({
      productId: productResult.value.id,
      slug: "events-price",
      amount: 0,
      interval: "month",
    });

    if (Result.isError(priceResult)) {
      throw new Error("expected price creation to succeed");
    }

    await hyprpay.api.catalog.prices.update(priceResult.value.id, { amount: 100 });
    await hyprpay.api.catalog.prices.archive(priceResult.value.id);

    expect(seen).toContain("billing.product.created");
    expect(seen).toContain("billing.product.updated");
    expect(seen).toContain("billing.product.archived");
    expect(seen).toContain("billing.price.created");
    expect(seen).toContain("billing.price.updated");
    expect(seen).toContain("billing.price.archived");
  });
});
