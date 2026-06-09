import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import type {
  CustomersDatabaseAdapter,
  CustomersLookupAdapter,
} from "../src/contracts/customers-database-adapter";
import type {
  CustomersProviderAdapter,
  ProviderCustomer,
} from "../src/contracts/customers-provider-adapter";
import { customers } from "../src/customers-plugin";
import type { CustomerPluginEvent } from "../src/customers-plugin";
import type { Customer, CustomerInput, CustomerListFilter } from "../src/schemas/customer-schema";
import { detectDocumentType } from "../src/schemas/shared-schema";

const ok = <T>(value: T) => Result.ok<T, never>(value);

const createInMemoryDatabase = (): CustomersDatabaseAdapter & CustomersLookupAdapter => {
  const store = new Map<string, Customer>();

  return {
    customers: {
      create: async (input: Customer) => {
        store.set(input.id, input);
        return ok(input);
      },
      findById: async (id: string) => ok(store.get(id) ?? null),
      findByExternalId: async (externalId: string) => {
        for (const customer of store.values()) {
          if (customer.externalId === externalId) {
            return ok<Customer | null>(customer);
          }
        }
        return ok<Customer | null>(null);
      },
      update: async (input: Customer) => {
        store.set(input.id, input);
        return ok(input);
      },
      list: async (filter: CustomerListFilter) => {
        let rows = Array.from(store.values());

        if (!filter.includeDeleted) {
          rows = rows.filter(row => row.deletedAt === undefined);
        }

        if (filter.email !== undefined) {
          rows = rows.filter(row => row.email === filter.email);
        }

        if (filter.externalId !== undefined) {
          rows = rows.filter(row => row.externalId === filter.externalId);
        }

        if (filter.search !== undefined) {
          const needle = filter.search.toLowerCase();
          rows = rows.filter(
            row =>
              row.name.toLowerCase().includes(needle) ||
              row.email.toLowerCase().includes(needle) ||
              row.document.includes(needle),
          );
        }

        rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

        return ok(rows.slice(filter.offset, filter.offset + filter.limit));
      },
    },
  };
};

const createProvider = (): CustomersProviderAdapter => ({
  id: "stub-provider",
  createCustomer: async (input: CustomerInput) => {
    const draft: ProviderCustomer = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      document: input.document,
      providerCustomerId: `psp_${input.document}`,
      ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
      ...(input.billingAddress !== undefined ? { billingAddress: input.billingAddress } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    return ok(draft);
  },
});

const buildHarness = () => {
  const events: CustomerPluginEvent[] = [];
  const database = createInMemoryDatabase();
  const provider = createProvider();

  const hyprpay = createHyprPay({
    plugins: [
      customers({ database, provider }),
      {
        id: "event-recorder",
        namespace: "eventRecorder",
        hooks: {
          onEvent: async event => {
            events.push(event as CustomerPluginEvent);
          },
        },
      },
    ] as const,
  });

  return { hyprpay, events };
};

const baseInput: CustomerInput = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  document: "12345678901",
};

describe("@hyprpay/customers", () => {
  it("creates a customer with structured address + taxId and emits created", async () => {
    const { hyprpay, events } = buildHarness();

    const result = await hyprpay.api.customers.create({
      ...baseInput,
      externalId: "ext-1",
      taxId: "ISENTO",
      billingAddress: {
        line1: "Rua das Flores, 100",
        city: "São Paulo",
        state: "SP",
        postalCode: "01000-000",
        country: "BR",
      },
    });

    expect(Result.isOk(result)).toBe(true);

    if (Result.isError(result)) {
      throw new Error("expected create to succeed");
    }

    expect(result.value.documentType).toBe("cpf");
    expect(result.value.taxId).toBe("ISENTO");
    expect(result.value.billingAddress?.city).toBe("São Paulo");
    expect(result.value.createdAt).toBeDefined();
    expect(result.value.updatedAt).toBe(result.value.createdAt);
    expect(events.map(event => event.type)).toContain("billing.customer.created");
  });

  it("reads a customer by primary id", async () => {
    const { hyprpay } = buildHarness();

    const created = await hyprpay.api.customers.create(baseInput);
    if (Result.isError(created)) {
      throw new Error("expected create to succeed");
    }

    const fetched = await hyprpay.api.customers.getById(created.value.id);
    expect(Result.isOk(fetched)).toBe(true);
    if (Result.isError(fetched)) {
      throw new Error("expected getById to succeed");
    }
    expect(fetched.value?.id).toBe(created.value.id);

    const missing = await hyprpay.api.customers.getById("does-not-exist");
    if (Result.isError(missing)) {
      throw new Error("expected getById to succeed for missing id");
    }
    expect(missing.value).toBeNull();
  });

  it("reads a customer by external id", async () => {
    const { hyprpay } = buildHarness();

    await hyprpay.api.customers.create({ ...baseInput, externalId: "ext-42" });

    const fetched = await hyprpay.api.customers.getByExternalId("ext-42");
    if (Result.isError(fetched)) {
      throw new Error("expected getByExternalId to succeed");
    }
    expect(fetched.value?.externalId).toBe("ext-42");
  });

  it("updates a customer by id, re-derives documentType, and emits updated", async () => {
    const { hyprpay, events } = buildHarness();

    const created = await hyprpay.api.customers.create(baseInput);
    if (Result.isError(created)) {
      throw new Error("expected create to succeed");
    }

    const updated = await hyprpay.api.customers.update(created.value.id, {
      name: "Ada B. Lovelace",
      document: "12345678000199",
      taxId: "123.456",
      billingAddress: { city: "Rio de Janeiro", country: "BR" },
    });

    if (Result.isError(updated)) {
      throw new Error("expected update to succeed");
    }

    expect(updated.value.name).toBe("Ada B. Lovelace");
    expect(updated.value.documentType).toBe(detectDocumentType("12345678000199"));
    expect(updated.value.documentType).toBe("cnpj");
    expect(updated.value.taxId).toBe("123.456");
    expect(updated.value.billingAddress?.city).toBe("Rio de Janeiro");
    expect(updated.value.createdAt).toBe(created.value.createdAt);
    expect(events.map(event => event.type)).toContain("billing.customer.updated");
  });

  it("updates a customer by external id", async () => {
    const { hyprpay } = buildHarness();

    await hyprpay.api.customers.create({ ...baseInput, externalId: "ext-99" });

    const updated = await hyprpay.api.customers.updateByExternalId("ext-99", {
      phone: "+5511999999999",
    });

    if (Result.isError(updated)) {
      throw new Error("expected updateByExternalId to succeed");
    }
    expect(updated.value.phone).toBe("+5511999999999");
  });

  it("returns NOT_FOUND when updating a missing customer", async () => {
    const { hyprpay } = buildHarness();

    const updated = await hyprpay.api.customers.update("missing", { name: "Nobody" });
    expect(Result.isError(updated)).toBe(true);
    if (Result.isOk(updated)) {
      throw new Error("expected update to fail");
    }
    expect(updated.error.error.status).toBe(404);
  });

  it("lists, searches, filters, and paginates customers", async () => {
    const { hyprpay } = buildHarness();

    await hyprpay.api.customers.create({
      ...baseInput,
      name: "Alan Turing",
      email: "alan@example.com",
      externalId: "ext-a",
    });
    await hyprpay.api.customers.create({
      ...baseInput,
      name: "Grace Hopper",
      email: "grace@example.com",
      document: "98765432100",
      externalId: "ext-b",
    });

    const all = await hyprpay.api.customers.list();
    if (Result.isError(all)) {
      throw new Error("expected list to succeed");
    }
    expect(all.value.length).toBe(2);

    const searched = await hyprpay.api.customers.list({ search: "grace" });
    if (Result.isError(searched)) {
      throw new Error("expected search to succeed");
    }
    expect(searched.value.length).toBe(1);
    expect(searched.value[0]?.name).toBe("Grace Hopper");

    const byEmail = await hyprpay.api.customers.list({ email: "alan@example.com" });
    if (Result.isError(byEmail)) {
      throw new Error("expected email filter to succeed");
    }
    expect(byEmail.value.length).toBe(1);

    const paged = await hyprpay.api.customers.list({ limit: 1, offset: 1 });
    if (Result.isError(paged)) {
      throw new Error("expected pagination to succeed");
    }
    expect(paged.value.length).toBe(1);
  });

  it("soft deletes a customer, hides it from default listing, and emits deleted", async () => {
    const { hyprpay, events } = buildHarness();

    const created = await hyprpay.api.customers.create(baseInput);
    if (Result.isError(created)) {
      throw new Error("expected create to succeed");
    }

    const deleted = await hyprpay.api.customers.softDelete(created.value.id);
    if (Result.isError(deleted)) {
      throw new Error("expected softDelete to succeed");
    }
    expect(deleted.value.deletedAt).toBeDefined();
    expect(events.map(event => event.type)).toContain("billing.customer.deleted");

    const visible = await hyprpay.api.customers.list();
    if (Result.isError(visible)) {
      throw new Error("expected list to succeed");
    }
    expect(visible.value.length).toBe(0);

    const withDeleted = await hyprpay.api.customers.list({ includeDeleted: true });
    if (Result.isError(withDeleted)) {
      throw new Error("expected list to succeed");
    }
    expect(withDeleted.value.length).toBe(1);

    const secondDelete = await hyprpay.api.customers.softDelete(created.value.id);
    expect(Result.isError(secondDelete)).toBe(true);
  });
});
