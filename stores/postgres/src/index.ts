import { sql, type SQLWrapper } from "drizzle-orm";
import { Effect } from "effect";
import { notFound, storeFailed, type StoreFailed } from "@hyprpay/core/errors";
import type { PlanDefinition, ProductDefinition } from "@hyprpay/core/catalog";
import type {
  BenefitGrant,
  BillingEvent,
  Checkout,
  Customer,
  LicenseKey,
  LicenseKeyActivation,
  Order,
  PortalSession,
  Refund,
  Seat,
  Subscription,
  UsageRecord,
} from "@hyprpay/core/schemas";
import type { HyprPayStore, Repository } from "@hyprpay/core/store";

export interface HyprPayPostgresRowsResult<TRow extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: readonly TRow[];
}

export type HyprPayPostgresQueryResult<TRow extends Record<string, unknown> = Record<string, unknown>> =
  | readonly TRow[]
  | HyprPayPostgresRowsResult<TRow>;

export interface HyprPayPostgresDatabase {
  execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
    query: SQLWrapper | string,
  ): PromiseLike<HyprPayPostgresQueryResult<TRow>>;
}

export interface CreatePostgresStoreOptions {
  readonly db: HyprPayPostgresDatabase;
}

interface JsonRow extends Record<string, unknown> {
  readonly data: unknown;
}

interface HyprPayPostgresTables {
  readonly customers: string;
  readonly checkouts: string;
  readonly orders: string;
  readonly subscriptions: string;
  readonly refunds: string;
  readonly events: string;
  readonly benefitGrants: string;
  readonly usageRecords: string;
  readonly licenseKeys: string;
  readonly licenseKeyActivations: string;
  readonly seats: string;
  readonly portalSessions: string;
  readonly catalogVersions: string;
}

const tables: HyprPayPostgresTables = {
  customers: "hyprpay_customers",
  checkouts: "hyprpay_checkouts",
  orders: "hyprpay_orders",
  subscriptions: "hyprpay_subscriptions",
  refunds: "hyprpay_refunds",
  events: "hyprpay_events",
  benefitGrants: "hyprpay_benefit_grants",
  usageRecords: "hyprpay_usage_records",
  licenseKeys: "hyprpay_license_keys",
  licenseKeyActivations: "hyprpay_license_key_activations",
  seats: "hyprpay_seats",
  portalSessions: "hyprpay_portal_sessions",
  catalogVersions: "hyprpay_catalog_versions",
};

const valuesMatch = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const matchesFilter = <TRecord extends { readonly id: string }>(record: TRecord, filter?: Partial<TRecord>) => {
  if (filter === undefined) {
    return true;
  }

  return Object.entries(filter).every(([key, value]) => valuesMatch(Reflect.get(record, key), value));
};

export interface HyprPayCatalogVersion {
  readonly id: string;
  readonly productId: string;
  readonly planId: string;
  readonly fingerprint: string;
  readonly data: {
    readonly product: ProductDefinition;
    readonly plan: PlanDefinition;
  };
  readonly createdAt: string;
}

export interface CatalogSyncResult {
  readonly products: number;
  readonly plans: number;
  readonly insertedVersions: number;
  readonly existingVersions: number;
}

const hashText = (value: string): Effect.Effect<string, StoreFailed> =>
  Effect.tryPromise({
    try: async () => {
      const data = new TextEncoder().encode(value);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    },
    catch: () => storeFailed(),
  });

const hasRows = <TRow extends Record<string, unknown>>(
  result: HyprPayPostgresQueryResult<TRow>,
): result is HyprPayPostgresRowsResult<TRow> => "rows" in result;

const queryRows = <TRow extends Record<string, unknown>>(result: HyprPayPostgresQueryResult<TRow>): readonly TRow[] =>
  hasRows(result) ? result.rows : result;

const query = <TRow extends Record<string, unknown> = Record<string, unknown>>(
  db: HyprPayPostgresDatabase,
  statement: SQLWrapper | string,
): Effect.Effect<readonly TRow[], StoreFailed> =>
  Effect.tryPromise({
    try: async () => queryRows(await Promise.resolve(db.execute<TRow>(statement))),
    catch: () => storeFailed(),
  });

const tableIdentifier = (tableName: string) => sql.identifier(tableName);

const parseRecord = <TRecord extends { readonly id: string }>(row: JsonRow): TRecord => {
  const serialized = typeof row.data === "string" ? row.data : JSON.stringify(row.data);
  return JSON.parse(serialized);
};

const migrateTable = (db: HyprPayPostgresDatabase, tableName: string): Effect.Effect<void, StoreFailed> =>
  query(
    db,
    sql`CREATE TABLE IF NOT EXISTS ${tableIdentifier(tableName)} (id TEXT PRIMARY KEY NOT NULL, data JSONB NOT NULL)`,
  ).pipe(Effect.asVoid);

export const migrateHyprPayPostgresStore = (db: HyprPayPostgresDatabase): Effect.Effect<void, StoreFailed> =>
  Effect.gen(function* () {
    yield* migrateTable(db, tables.customers);
    yield* migrateTable(db, tables.checkouts);
    yield* migrateTable(db, tables.orders);
    yield* migrateTable(db, tables.subscriptions);
    yield* migrateTable(db, tables.refunds);
    yield* migrateTable(db, tables.events);
    yield* migrateTable(db, tables.benefitGrants);
    yield* migrateTable(db, tables.usageRecords);
    yield* migrateTable(db, tables.licenseKeys);
    yield* migrateTable(db, tables.licenseKeyActivations);
    yield* migrateTable(db, tables.seats);
    yield* migrateTable(db, tables.portalSessions);
    yield* migrateTable(db, tables.catalogVersions);
  });

const createPostgresRepository = <TRecord extends { readonly id: string }>(
  db: HyprPayPostgresDatabase,
  tableName: string,
): Repository<TRecord> => {
  const table = tableIdentifier(tableName);
  const findById = (recordId: string) =>
    query<JsonRow>(db, sql`SELECT data FROM ${table} WHERE id = ${recordId} LIMIT 1`).pipe(
      Effect.map(rows => {
        const row = rows[0];
        return row === undefined ? null : parseRecord<TRecord>(row);
      }),
    );

  return {
    create: record =>
      query(
        db,
        sql`INSERT INTO ${table} (id, data) VALUES (${record.id}, ${JSON.stringify(record)}::jsonb)`,
      ).pipe(Effect.as(record)),
    update: (recordId, patch) => Effect.gen(function* () {
      const current = yield* findById(recordId);

      if (current === null) {
        return yield* Effect.fail(notFound());
      }

      const next: TRecord = { ...current, ...patch, id: recordId };
      yield* query(db, sql`UPDATE ${table} SET data = ${JSON.stringify(next)}::jsonb WHERE id = ${recordId}`);
      return next;
    }),
    findById,
    list: filter =>
      query<JsonRow>(db, sql`SELECT data FROM ${table}`).pipe(
        Effect.map(rows => rows.map(parseRecord<TRecord>).filter(record => matchesFilter(record, filter))),
      ),
  };
};

export const syncHyprPayCatalog = (
  db: HyprPayPostgresDatabase,
  catalog: readonly ProductDefinition[],
): Effect.Effect<CatalogSyncResult, StoreFailed> =>
  Effect.gen(function* () {
    const versions = createPostgresRepository<HyprPayCatalogVersion>(db, tables.catalogVersions);
    let plans = 0;
    let insertedVersions = 0;
    let existingVersions = 0;

    for (const product of catalog) {
      for (const plan of product.plans) {
        plans += 1;
        const productVersion = { ...product, plans: [plan] };
        const payload = { product: productVersion, plan };
        const fingerprint = yield* hashText(JSON.stringify(payload));
        const existing = yield* versions.list({
          productId: product.id,
          planId: plan.id,
          fingerprint,
        }).pipe(Effect.mapError(() => storeFailed()));

        if (existing.length > 0) {
          existingVersions += 1;
          continue;
        }

        yield* versions.create({
          id: `cv_${fingerprint}`,
          productId: product.id,
          planId: plan.id,
          fingerprint,
          data: payload,
          createdAt: new Date().toISOString(),
        }).pipe(Effect.mapError(() => storeFailed()));
        insertedVersions += 1;
      }
    }

    return {
      products: catalog.length,
      plans,
      insertedVersions,
      existingVersions,
    };
  });

export const postgresStore = (options: CreatePostgresStoreOptions): HyprPayStore => ({
  customers: createPostgresRepository<Customer>(options.db, tables.customers),
  checkouts: createPostgresRepository<Checkout>(options.db, tables.checkouts),
  orders: createPostgresRepository<Order>(options.db, tables.orders),
  subscriptions: createPostgresRepository<Subscription>(options.db, tables.subscriptions),
  refunds: createPostgresRepository<Refund>(options.db, tables.refunds),
  events: createPostgresRepository<BillingEvent>(options.db, tables.events),
  benefitGrants: createPostgresRepository<BenefitGrant>(options.db, tables.benefitGrants),
  usageRecords: createPostgresRepository<UsageRecord>(options.db, tables.usageRecords),
  licenseKeys: createPostgresRepository<LicenseKey>(options.db, tables.licenseKeys),
  licenseKeyActivations: createPostgresRepository<LicenseKeyActivation>(options.db, tables.licenseKeyActivations),
  seats: createPostgresRepository<Seat>(options.db, tables.seats),
  portalSessions: createPostgresRepository<PortalSession>(options.db, tables.portalSessions),
});
