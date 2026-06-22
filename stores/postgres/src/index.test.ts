import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "@effect/vitest";
import { drizzle } from "drizzle-orm/pglite";
import { Effect } from "effect";
import { createHyprPay, feature, plan, product } from "@hyprpay/core";
import { migrateHyprPayPostgresStore, postgresStore, syncHyprPayCatalog } from "./index";
import { hyprPayPostgresSchema } from "./schema";

const testDirectories: string[] = [];

const testStore = async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "hyprpay-postgres-"));
  testDirectories.push(dataDir);
  const db = drizzle({ connection: { dataDir }, schema: hyprPayPostgresSchema });
  await Effect.runPromise(migrateHyprPayPostgresStore(db));
  return postgresStore({ db });
};

afterAll(async () => {
  await Promise.all(testDirectories.map(dataDir => rm(dataDir, { recursive: true, force: true })));
});

describe("postgresStore", () => {
  it("persists customers, checkouts and orders through Postgres", async () => {
    const hyprpay = createHyprPay({ store: await testStore() });
    const customer = await Effect.runPromise(hyprpay.customers.create({ name: "Empresa XPTO" }));
    const checkout = await Effect.runPromise(hyprpay.checkouts.create({ customerId: customer.id, amount: 1990 }));
    const orders = await Effect.runPromise(hyprpay.orders.list({ checkoutId: checkout.id }));

    expect(orders).toHaveLength(1);
    expect(orders[0]?.customerId).toBe(customer.id);
    expect(orders[0]?.amount).toBe(1990);
  });

  it("persists metered entitlement usage idempotently", async () => {
    const messages = feature.metered({ id: "messages" });
    const free = plan({
      id: "free",
      default: true,
      includes: [messages({ limit: 2 })],
    });
    const billing = product({ id: "billing", name: "Billing", plans: [free] });
    const hyprpay = createHyprPay({ store: await testStore(), catalog: [billing] });

    await Effect.runPromise(
      hyprpay.entitlements.report({ customerId: "cus_1", featureId: "messages", amount: 1, idempotencyKey: "evt_1" }),
    );
    await Effect.runPromise(
      hyprpay.entitlements.report({ customerId: "cus_1", featureId: "messages", amount: 1, idempotencyKey: "evt_1" }),
    );
    const access = await Effect.runPromise(hyprpay.entitlements.check({ customerId: "cus_1", featureId: "messages", amount: 2 }));

    expect(access.allowed).toBe(false);
    expect(access.balance?.remaining).toBe(1);
  });

  it("keeps catalog versions immutable across repeated syncs", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "hyprpay-postgres-"));
    testDirectories.push(dataDir);
    const db = drizzle({ connection: { dataDir }, schema: hyprPayPostgresSchema });
    await Effect.runPromise(migrateHyprPayPostgresStore(db));
    const messages = feature.metered({ id: "messages" });
    const free = plan({
      id: "free",
      default: true,
      includes: [messages({ limit: 100 })],
    });
    const pro = plan({
      id: "pro",
      price: { amountMinor: 1990, currency: "BRL", interval: "month" },
      includes: [messages({ limit: 2_000 })],
    });
    const billing = product({ id: "billing", name: "Billing", plans: [free, pro] });

    const first = await Effect.runPromise(syncHyprPayCatalog(db, [billing]));
    const repeated = await Effect.runPromise(syncHyprPayCatalog(db, [billing]));
    const changedPro = plan({
      id: "pro",
      price: { amountMinor: 2990, currency: "BRL", interval: "month" },
      includes: [messages({ limit: 3_000 })],
    });
    const changed = await Effect.runPromise(
      syncHyprPayCatalog(db, [product({ id: "billing", name: "Billing", plans: [free, changedPro] })]),
    );

    expect(first.insertedVersions).toBe(2);
    expect(repeated.insertedVersions).toBe(0);
    expect(repeated.existingVersions).toBe(2);
    expect(changed.insertedVersions).toBe(1);
    expect(changed.existingVersions).toBe(1);
  });
});
