import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Result } from "better-result";
import type { BillingDatabaseAdapter,
BillingEvent,
BillingResult,
Charge,
Checkout,
Customer,
Price,
Product,
Subscription, } from "../billing-plugin"
import { BillingError,
billingErrors,
billingEventSchema,
chargeSchema,
checkoutSchema,
customerSchema,
priceSchema,
productSchema,
subscriptionSchema, } from "../billing-plugin"
import { billingSchema } from "./billing-schema";
import { mapCustomerRecord } from "./mappers/customer-record-mapper";
import { mapPriceRecord } from "./mappers/price-record-mapper";
import { mapProductRecord } from "./mappers/product-record-mapper";
import { mapSubscriptionRecord } from "./mappers/subscription-record-mapper";
import { billingCharges } from "./tables/billing-charges.table";
import { billingCheckouts } from "./tables/billing-checkouts.table";
import { billingCustomers } from "./tables/billing-customers.table";
import { billingPrices } from "./tables/billing-prices.table";
import { billingProducts } from "./tables/billing-products.table";
import { billingSubscriptions } from "./tables/billing-subscriptions.table";
import { billingWebhookEvents } from "./tables/billing-webhook-events.table";
import { drizzleQueryError } from "./errors/drizzle-errors";
import { drizzleErrors } from "./errors/drizzle-error-catalog";
import {
  billingCustomerDbInsertSchema,
  billingCustomerDbSelectSchema,
  billingCustomerDbUpdateSchema,
} from "./zod/customer-schemas";
import {
  billingPriceDbInsertSchema,
  billingPriceDbSelectSchema,
  billingPriceDbUpdateSchema,
} from "./zod/price-schemas";
import {
  billingProductDbInsertSchema,
  billingProductDbSelectSchema,
  billingProductDbUpdateSchema,
} from "./zod/product-schemas";
import {
  billingSubscriptionDbInsertSchema,
  billingSubscriptionDbSelectSchema,
  billingSubscriptionDbUpdateSchema,
} from "./zod/subscription-schemas";

export interface DrizzleAdapterOptions {
  schema?: typeof billingSchema;
}

export type BillingPgDatabase = PgDatabase<PgQueryResultHKT, typeof billingSchema>;

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

const mapCharge = (record: typeof billingCharges.$inferSelect): Charge => {
  const parsed = chargeSchema.safeParse({
    id: record.id,
    providerChargeId: record.providerChargeId ?? undefined,
    customerId: record.customerId,
    amount: record.amount,
    currency: record.currency,
    method: record.method,
    status: record.status,
    description: record.description ?? undefined,
    receiptUrl: record.receiptUrl ?? undefined,
    boleto: record.boleto ?? undefined,
    card: record.card ?? undefined,
    metadata: record.metadata,
    pix: record.pix ?? undefined,
    boletoDetails: record.boletoDetails ?? undefined,
  });

  if (!parsed.success) {
    throw new Error("Invalid stored charge record");
  }

  return parsed.data;
};

const mapCheckout = (record: typeof billingCheckouts.$inferSelect): Checkout => {
  const parsed = checkoutSchema.safeParse({
    id: record.id,
    providerCheckoutId: record.providerCheckoutId ?? undefined,
    customerId: record.customerId,
    subscriptionId: record.subscriptionId ?? undefined,
    priceId: record.priceId,
    providerProductId: record.providerProductId ?? undefined,
    methods: record.methods,
    successUrl: record.successUrl ?? undefined,
    cancelUrl: record.cancelUrl ?? undefined,
    metadata: record.metadata,
    url: record.url,
    amount: record.amount,
    currency: record.currency,
    status: record.status,
  });

  if (!parsed.success) {
    throw new Error("Invalid stored checkout record");
  }

  return parsed.data;
};

const mapEvent = (record: typeof billingWebhookEvents.$inferSelect): BillingEvent => {
  const parsed = billingEventSchema.safeParse({
    id: record.id,
    provider: record.provider,
    externalId: record.externalId,
    type: record.type,
    customerId: record.customerId ?? undefined,
    chargeId: record.chargeId ?? undefined,
    subscriptionId: record.subscriptionId ?? undefined,
    occurredAt: record.occurredAt,
    payload: record.payload,
  });

  if (!parsed.success) {
    throw new Error("Invalid stored billing event record");
  }

  return parsed.data;
};

export const drizzleAdapter = (
  db: BillingPgDatabase,
  options: DrizzleAdapterOptions = {},
): BillingDatabaseAdapter => {
  const schema = options.schema ?? billingSchema;

  return {
    products: {
      create: async (input: Product) => {
        const productToStore = billingProductDbInsertSchema.parse(input);
        const result = await runQuery("create product", async () => {
          const rows = await db.insert(schema.billingProducts).values(productToStore).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Produto não foi persistido.");
        }

        const product = mapProductRecord(result.value);
        const parsed = productSchema.safeParse(product);

        if (!parsed.success) {
          return invalidStoredRecord("Produto persistido com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      findById: async (id: string) => {
        const result = await runQuery("find product", async () => {
          const rows = await db
            .select()
            .from(schema.billingProducts)
            .where(eq(schema.billingProducts.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const product = mapProductRecord(result.value);
        const parsed = productSchema.safeParse(product);

        if (!parsed.success) {
          return invalidStoredRecord("Produto persistido com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      list: async (filter) => {
        const conditions = [
          ...(filter.active !== undefined ? [eq(schema.billingProducts.active, filter.active)] : []),
          ...(filter.slug !== undefined ? [eq(schema.billingProducts.slug, filter.slug)] : []),
        ];

        const result = await runQuery("list products", async () =>
          db.select().from(schema.billingProducts).where(and(...conditions)),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const products: Product[] = [];

        for (const row of result.value) {
          const parsed = productSchema.safeParse(mapProductRecord(row));

          if (!parsed.success) {
            return invalidStoredRecord("Produto persistido com shape inválido.");
          }

          products.push(parsed.data);
        }

        const offset = filter.offset ?? 0;
        const end = filter.limit !== undefined ? offset + filter.limit : undefined;

        return Result.ok(products.slice(offset, end));
      },
      update: async (input: Product) => {
        const productToStore = billingProductDbUpdateSchema.parse(input);
        const result = await runQuery("update product", async () => {
          const rows = await db
            .update(schema.billingProducts)
            .set(productToStore)
            .where(eq(schema.billingProducts.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Produto não foi atualizado.");
        }

        const parsed = productSchema.safeParse(mapProductRecord(result.value));

        if (!parsed.success) {
          return invalidStoredRecord("Produto persistido com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
    },
    prices: {
      create: async (input: Price) => {
        const priceToStore = billingPriceDbInsertSchema.parse(input);
        const result = await runQuery("create price", async () => {
          const rows = await db.insert(schema.billingPrices).values(priceToStore).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Preço não foi persistido.");
        }

        const price = mapPriceRecord(result.value);
        const parsed = priceSchema.safeParse(price);

        if (!parsed.success) {
          return invalidStoredRecord("Preço persistido com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      findById: async (id: string) => {
        const result = await runQuery("find price", async () => {
          const rows = await db.select().from(schema.billingPrices).where(eq(schema.billingPrices.id, id)).limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const price = mapPriceRecord(result.value);
        const parsed = priceSchema.safeParse(price);

        if (!parsed.success) {
          return invalidStoredRecord("Preço persistido com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      list: async (filter) => {
        const conditions = [
          ...(filter.productId !== undefined ? [eq(schema.billingPrices.productId, filter.productId)] : []),
          ...(filter.active !== undefined ? [eq(schema.billingPrices.active, filter.active)] : []),
        ];

        const result = await runQuery("list prices", async () =>
          db.select().from(schema.billingPrices).where(and(...conditions)),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const prices: Price[] = [];

        for (const row of result.value) {
          const parsed = priceSchema.safeParse(mapPriceRecord(row));

          if (!parsed.success) {
            return invalidStoredRecord("Preço persistido com shape inválido.");
          }

          prices.push(parsed.data);
        }

        const offset = filter.offset ?? 0;
        const end = filter.limit !== undefined ? offset + filter.limit : undefined;

        return Result.ok(prices.slice(offset, end));
      },
      update: async (input: Price) => {
        const priceToStore = billingPriceDbUpdateSchema.parse(input);
        const result = await runQuery("update price", async () => {
          const rows = await db
            .update(schema.billingPrices)
            .set(priceToStore)
            .where(eq(schema.billingPrices.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Preço não foi atualizado.");
        }

        const parsed = priceSchema.safeParse(mapPriceRecord(result.value));

        if (!parsed.success) {
          return invalidStoredRecord("Preço persistido com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
    },
    customers: {
      create: async (input: Customer) => {
        const customerToStore = billingCustomerDbInsertSchema.parse(input);
        const result = await runQuery("create customer", async () => {
          const rows = await db.insert(schema.billingCustomers).values(customerToStore).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Cliente não foi persistido.");
        }

        const customer = mapCustomerRecord(result.value);
        const parsed = customerSchema.safeParse(customer);

        if (!parsed.success) {
          return invalidStoredRecord("Cliente persistido com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      findById: async (id: string) => {
        const result = await runQuery("find customer", async () => {
          const rows = await db
            .select()
            .from(schema.billingCustomers)
            .where(eq(schema.billingCustomers.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const customer = mapCustomerRecord(result.value);
        const parsed = customerSchema.safeParse(customer);

        if (!parsed.success) {
          return invalidStoredRecord("Cliente persistido com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      findByExternalId: async (externalId: string) => {
        const result = await runQuery("find customer by external id", async () => {
          const rows = await db
            .select()
            .from(schema.billingCustomers)
            .where(eq(schema.billingCustomers.externalId, externalId))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const customer = mapCustomerRecord(result.value);
        const parsed = customerSchema.safeParse(customer);

        if (!parsed.success) {
          return invalidStoredRecord("Cliente persistido com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      update: async (input: Customer) => {
        const customerToStore = billingCustomerDbUpdateSchema.parse(input);
        const result = await runQuery("update customer", async () => {
          const rows = await db
            .update(schema.billingCustomers)
            .set(customerToStore)
            .where(eq(schema.billingCustomers.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Cliente não foi atualizado.");
        }

        const parsed = customerSchema.safeParse(mapCustomerRecord(result.value));

        if (!parsed.success) {
          return invalidStoredRecord("Cliente persistido com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      list: async (filter) => {
        const needle = filter.search !== undefined ? `%${filter.search}%` : undefined;
        const conditions = [
          ...(filter.includeDeleted ? [] : [isNull(schema.billingCustomers.deletedAt)]),
          ...(filter.email !== undefined ? [eq(schema.billingCustomers.email, filter.email)] : []),
          ...(filter.externalId !== undefined
            ? [eq(schema.billingCustomers.externalId, filter.externalId)]
            : []),
          ...(needle !== undefined
            ? [
                or(
                  ilike(schema.billingCustomers.name, needle),
                  ilike(schema.billingCustomers.email, needle),
                  ilike(schema.billingCustomers.document, needle),
                ),
              ]
            : []),
        ];

        const result = await runQuery("list customers", async () =>
          db
            .select()
            .from(schema.billingCustomers)
            .where(and(...conditions))
            .orderBy(asc(schema.billingCustomers.createdAt)),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const customers: Customer[] = [];

        for (const row of result.value) {
          const parsed = customerSchema.safeParse(mapCustomerRecord(row));

          if (!parsed.success) {
            return invalidStoredRecord("Cliente persistido com shape inválido.");
          }

          customers.push(parsed.data);
        }

        return Result.ok(customers.slice(filter.offset, filter.offset + filter.limit));
      },
    },
    checkouts: {
      create: async (input: Checkout) => {
        const result = await runQuery("create checkout", async () => {
          const rows = await db.insert(schema.billingCheckouts).values(input).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Checkout não foi persistido.");
        }

        return Result.ok(mapCheckout(result.value));
      },
      findById: async (id: string) => {
        const result = await runQuery("find checkout", async () => {
          const rows = await db
            .select()
            .from(schema.billingCheckouts)
            .where(eq(schema.billingCheckouts.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        return Result.ok(mapCheckout(result.value));
      },
      list: async (filter) => {
        const conditions = [
          ...(filter.customerId !== undefined
            ? [eq(schema.billingCheckouts.customerId, filter.customerId)]
            : []),
          ...(filter.subscriptionId !== undefined
            ? [eq(schema.billingCheckouts.subscriptionId, filter.subscriptionId)]
            : []),
        ];

        const result = await runQuery("list checkouts", async () =>
          db.select().from(schema.billingCheckouts).where(and(...conditions)),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        return Result.ok(result.value.map(mapCheckout));
      },
    },
    charges: {
      create: async (input: Charge) => {
        const result = await runQuery("create charge", async () => {
          const rows = await db.insert(schema.billingCharges).values(input).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Cobrança não foi persistida.");
        }

        return Result.ok(mapCharge(result.value));
      },
      update: async (input: Charge) => {
        const result = await runQuery("update charge", async () => {
          const rows = await db
            .update(schema.billingCharges)
            .set(input)
            .where(eq(schema.billingCharges.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Cobrança não foi atualizada.");
        }

        return Result.ok(mapCharge(result.value));
      },
      findById: async (id: string) => {
        const result = await runQuery("find charge", async () => {
          const rows = await db.select().from(schema.billingCharges).where(eq(schema.billingCharges.id, id)).limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        return Result.ok(mapCharge(result.value));
      },
    },
    subscriptions: {
      create: async (input: Subscription) => {
        const subscriptionToStore = billingSubscriptionDbInsertSchema.parse(input);
        const result = await runQuery("create subscription", async () => {
          const rows = await db.insert(schema.billingSubscriptions).values(subscriptionToStore).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Assinatura não foi persistida.");
        }

        const subscription = mapSubscriptionRecord(result.value);
        const parsed = subscriptionSchema.safeParse(subscription);

        if (!parsed.success) {
          return invalidStoredRecord("Assinatura persistida com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      update: async (input: Subscription) => {
        const subscriptionToStore = billingSubscriptionDbUpdateSchema.parse(input);
        const result = await runQuery("update subscription", async () => {
          const rows = await db
            .update(schema.billingSubscriptions)
            .set(subscriptionToStore)
            .where(eq(schema.billingSubscriptions.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Assinatura não foi atualizada.");
        }

        const subscription = mapSubscriptionRecord(result.value);
        const parsed = subscriptionSchema.safeParse(subscription);

        if (!parsed.success) {
          return invalidStoredRecord("Assinatura persistida com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      findById: async (id: string) => {
        const result = await runQuery("find subscription", async () => {
          const rows = await db
            .select()
            .from(schema.billingSubscriptions)
            .where(eq(schema.billingSubscriptions.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const subscription = mapSubscriptionRecord(result.value);
        const parsed = subscriptionSchema.safeParse(subscription);

        if (!parsed.success) {
          return invalidStoredRecord("Assinatura persistida com shape inválido.");
        }

        return Result.ok(parsed.data);
      },
      list: async (filter) => {
        const conditions = [
          ...(filter.customerId !== undefined
            ? [eq(schema.billingSubscriptions.customerId, filter.customerId)]
            : []),
          ...(filter.status !== undefined ? [eq(schema.billingSubscriptions.status, filter.status)] : []),
          ...(filter.priceId !== undefined ? [eq(schema.billingSubscriptions.priceId, filter.priceId)] : []),
        ];

        const result = await runQuery("list subscriptions", async () =>
          db.select().from(schema.billingSubscriptions).where(and(...conditions)),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const subscriptions: Subscription[] = [];

        for (const row of result.value) {
          const parsed = subscriptionSchema.safeParse(mapSubscriptionRecord(row));

          if (!parsed.success) {
            return invalidStoredRecord("Assinatura persistida com shape inválido.");
          }

          subscriptions.push(parsed.data);
        }

        return Result.ok(subscriptions.slice(filter.offset, filter.offset + filter.limit));
      },
    },
    events: {
      append: async (input: BillingEvent) => {
        const eventToStore = {
          ...input,
          externalId: input.externalId ?? input.id,
        };
        const result = await runQuery("append billing event", async () => {
          const rows = await db.insert(schema.billingWebhookEvents).values(eventToStore).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Evento de billing não foi persistido.");
        }

        return Result.ok(mapEvent(result.value));
      },
      hasProcessed: async (provider: string, externalId: string) => {
        const result = await runQuery("find billing event", async () => {
          const rows = await db
            .select({ id: schema.billingWebhookEvents.id })
            .from(schema.billingWebhookEvents)
            .where(
              and(
                eq(schema.billingWebhookEvents.provider, provider),
                eq(schema.billingWebhookEvents.externalId, externalId),
              ),
            )
            .limit(1);
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

export {
  billingCustomerDbInsertSchema,
  billingCustomerDbSelectSchema,
  billingCustomerDbUpdateSchema,
  billingPriceDbInsertSchema,
  billingPriceDbSelectSchema,
  billingPriceDbUpdateSchema,
  billingProductDbInsertSchema,
  billingProductDbSelectSchema,
  billingProductDbUpdateSchema,
  billingSubscriptionDbInsertSchema,
  billingSubscriptionDbSelectSchema,
  billingSubscriptionDbUpdateSchema,
};
export {
  /** @deprecated use billingCustomerDbInsertSchema */
  billingCustomerDbInsertSchema as billingCustomerInsertSchema,
  /** @deprecated use billingCustomerDbSelectSchema */
  billingCustomerDbSelectSchema as billingCustomerSelectSchema,
  /** @deprecated use billingCustomerDbUpdateSchema */
  billingCustomerDbUpdateSchema as billingCustomerUpdateSchema,
  /** @deprecated use billingPriceDbInsertSchema */
  billingPriceDbInsertSchema as billingPriceInsertSchema,
  /** @deprecated use billingPriceDbSelectSchema */
  billingPriceDbSelectSchema as billingPriceSelectSchema,
  /** @deprecated use billingPriceDbUpdateSchema */
  billingPriceDbUpdateSchema as billingPriceUpdateSchema,
  /** @deprecated use billingProductDbInsertSchema */
  billingProductDbInsertSchema as billingProductInsertSchema,
  /** @deprecated use billingProductDbSelectSchema */
  billingProductDbSelectSchema as billingProductSelectSchema,
  /** @deprecated use billingProductDbUpdateSchema */
  billingProductDbUpdateSchema as billingProductUpdateSchema,
  /** @deprecated use billingSubscriptionDbInsertSchema */
  billingSubscriptionDbInsertSchema as billingSubscriptionInsertSchema,
  /** @deprecated use billingSubscriptionDbSelectSchema */
  billingSubscriptionDbSelectSchema as billingSubscriptionSelectSchema,
  /** @deprecated use billingSubscriptionDbUpdateSchema */
  billingSubscriptionDbUpdateSchema as billingSubscriptionUpdateSchema,
};
export { billingSchema, drizzleErrors };
