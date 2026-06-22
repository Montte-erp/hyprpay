import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "@effect/vitest";
import { drizzle } from "drizzle-orm/pglite";
import { Effect } from "effect";
import { migrateHyprPayPostgresStore, postgresStore } from "../../stores/postgres/src/index";
import { hyprPayPostgresSchema } from "../../stores/postgres/src/schema";
import { capabilityUnsupported, createHyprPay, type PaymentProviderAdapter } from "../index";

const testDirectories: string[] = [];

const createTestStore = async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "hyprpay-effect-boundaries-"));
  testDirectories.push(dataDir);
  const db = drizzle({ connection: { dataDir }, schema: hyprPayPostgresSchema });
  await Effect.runPromise(migrateHyprPayPostgresStore(db));
  return postgresStore({ db });
};

const unsupportedProvider = (id: string): PaymentProviderAdapter => ({
  id,
  capabilities: {
    customers: false,
    checkouts: false,
    subscriptions: false,
    refunds: false,
    webhooks: false,
  },
  createCustomer: () => Effect.fail(capabilityUnsupported("customers")),
  createCheckout: () => Effect.fail(capabilityUnsupported("checkouts")),
  createSubscription: () => Effect.fail(capabilityUnsupported("subscriptions")),
  refund: () => Effect.fail(capabilityUnsupported("refunds")),
  parseWebhook: () => Effect.fail(capabilityUnsupported("webhooks")),
});

afterAll(async () => {
  await Promise.all(testDirectories.map(dataDir => rm(dataDir, { recursive: true, force: true })));
});

describe("Effect-native boundaries", () => {
  it.effect("returns typed errors instead of throwing for missing checkout customer", () =>
    Effect.gen(function* () {
      const store = yield* Effect.promise(createTestStore);
      const hyprpay = createHyprPay({ store });
      const error = yield* Effect.flip(hyprpay.checkouts.create({ customerId: "missing", amount: 1000 }));

      expect(error._tag).toBe("NotFound");
    }));

  it.effect("returns typed capability errors at the provider boundary", () =>
    Effect.gen(function* () {
      const store = yield* Effect.promise(createTestStore);
      const hyprpay = createHyprPay({ store, provider: unsupportedProvider("manual") });
      const error = yield* Effect.flip(hyprpay.webhooks.receive({
        request: new Request("https://billing.example.com/webhooks/manual", { method: "POST" }),
      }));

      expect(error._tag).toBe("CapabilityUnsupported");
      expect(error.capability).toBe("webhooks");
    }));
});
