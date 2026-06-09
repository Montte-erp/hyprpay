import { describe, expect, it } from "bun:test";
import { Result } from "better-result";
import { createHyprPay } from "../../../core/core/src/create-hyprpay";
import type { HyprPayPlugin, HyprPayRuntimeEvent } from "../../../core/core/src/contracts/hyprpay-plugin";
import { createInMemoryOrdersDatabaseAdapter } from "../src/in-memory-orders-database-adapter";
import { orders } from "../src/orders-plugin";
import type { Invoice, Order, OrderInput } from "../src/orders-plugin";

const billingAddress = {
  line1: "Rua das Flores, 100",
  city: "São Paulo",
  state: "SP",
  postalCode: "01000-000",
  country: "BR",
};

const baseOrderInput = (overrides: Partial<OrderInput> = {}): OrderInput => ({
  customerId: "cust_123",
  billingReason: "purchase",
  currency: "BRL",
  items: [{ label: "Plano Pro", unitAmount: 5000, quantity: 2 }],
  ...overrides,
});

// Capturing plugin: records every emitted runtime event so tests can assert
// that domain events fired with the right payloads.
const createEventRecorder = () => {
  const events: HyprPayRuntimeEvent[] = [];
  const plugin: HyprPayPlugin<"recorder", Record<string, never>> = {
    id: "recorder",
    namespace: "recorder",
    hooks: {
      onEvent: async event => {
        events.push(event);
      },
    },
  };

  return { events, plugin };
};

const setup = () => {
  const database = createInMemoryOrdersDatabaseAdapter();
  const recorder = createEventRecorder();
  const hyprpay = createHyprPay({
    plugins: [orders({ database }), recorder.plugin] as const,
  });

  return { hyprpay, events: recorder.events };
};

const unwrapOk = <T>(result: Result<T, unknown>): T => {
  if (Result.isError(result)) {
    throw new Error(`expected ok result, got error: ${String(result.error)}`);
  }

  return result.value;
};

describe("@hyprpay/orders — billing identity + net_amount", () => {
  it("snapshots billing name and address onto the order at creation", async () => {
    const { hyprpay } = setup();

    const created = unwrapOk(
      await hyprpay.api.orders.create(
        baseOrderInput({ billingName: "Acme LTDA", billingAddress }),
      ),
    );

    expect(created.billingName).toBe("Acme LTDA");
    expect(created.billingAddress).toEqual(billingAddress);
    // Denormalized snapshot, not a customerId reference.
    expect(created.customerId).toBe("cust_123");
  });

  it("computes net_amount as total minus refunded across the lifecycle", async () => {
    const { hyprpay } = setup();

    const created = unwrapOk(await hyprpay.api.orders.create(baseOrderInput()));
    // subtotal = 5000 * 2 = 10000, no discount/tax → total 10000, net 10000.
    expect(created.totalAmount).toBe(10000);
    expect(created.netAmount).toBe(10000);

    const refunded = unwrapOk(
      await hyprpay.api.orders.recordRefund({ orderId: created.id, amount: 3000 }),
    );
    expect(refunded.amountRefunded).toBe(3000);
    expect(refunded.netAmount).toBe(7000);
    expect(refunded.status).toBe("partially_refunded");

    const fullyRefunded = unwrapOk(
      await hyprpay.api.orders.recordRefund({ orderId: created.id, amount: 7000 }),
    );
    expect(fullyRefunded.netAmount).toBe(0);
    expect(fullyRefunded.status).toBe("refunded");
  });
});

describe("@hyprpay/orders — update billing details (PATCH before issue)", () => {
  it("patches billing identity while the order is pending", async () => {
    const { hyprpay } = setup();

    const created = unwrapOk(await hyprpay.api.orders.create(baseOrderInput()));
    expect(created.billingName).toBeUndefined();

    const updated = unwrapOk(
      await hyprpay.api.orders.update({
        orderId: created.id,
        billing: { billingName: "Updated Name", billingAddress },
      }),
    );

    expect(updated.billingName).toBe("Updated Name");
    expect(updated.billingAddress).toEqual(billingAddress);
  });

  it("rejects an empty billing update", async () => {
    const { hyprpay } = setup();

    const created = unwrapOk(await hyprpay.api.orders.create(baseOrderInput()));

    const result = await hyprpay.api.orders.update({
      orderId: created.id,
      billing: {} as never,
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("freezes billing identity once the order leaves pending", async () => {
    const { hyprpay } = setup();

    const created = unwrapOk(await hyprpay.api.orders.create(baseOrderInput()));
    await hyprpay.api.orders.markPaid(created.id);

    const result = await hyprpay.api.orders.update({
      orderId: created.id,
      billing: { billingName: "Too Late" },
    });

    expect(Result.isError(result)).toBe(true);
  });

  it("returns NOT_FOUND when updating a missing order", async () => {
    const { hyprpay } = setup();

    const result = await hyprpay.api.orders.update({
      orderId: "missing",
      billing: { billingName: "Ghost" },
    });

    expect(Result.isError(result)).toBe(true);
  });
});

describe("@hyprpay/orders — invoices", () => {
  const issueFor = async (
    hyprpay: ReturnType<typeof setup>["hyprpay"],
    order: Order,
  ): Promise<Invoice> => {
    const draft = unwrapOk(await hyprpay.api.orders.draftInvoice({ orderId: order.id }));
    return unwrapOk(await hyprpay.api.orders.issueInvoice(draft.id));
  };

  it("drafts an invoice snapshotting amount and billing identity from the order", async () => {
    const { hyprpay, events } = setup();

    const order = unwrapOk(
      await hyprpay.api.orders.create(
        baseOrderInput({ billingName: "Acme LTDA", billingAddress }),
      ),
    );

    const draft = unwrapOk(await hyprpay.api.orders.draftInvoice({ orderId: order.id }));

    expect(draft.status).toBe("draft");
    expect(draft.invoiceNumber).toBeUndefined();
    expect(draft.amount).toBe(order.netAmount);
    expect(draft.billingName).toBe("Acme LTDA");
    expect(draft.billingAddress).toEqual(billingAddress);
    expect(events.some(event => event.type === "billing.invoice.created")).toBe(true);
  });

  it("issues an invoice with a monotonic per-namespace number and emits the event", async () => {
    const { hyprpay, events } = setup();

    const orderA = unwrapOk(await hyprpay.api.orders.create(baseOrderInput()));
    const orderB = unwrapOk(await hyprpay.api.orders.create(baseOrderInput()));

    const invoiceA = await issueFor(hyprpay, orderA);
    const invoiceB = await issueFor(hyprpay, orderB);

    expect(invoiceA.status).toBe("issued");
    expect(invoiceA.invoiceNumber).toBe("INV-000001");
    expect(invoiceA.issuedAt).toBeDefined();
    expect(invoiceB.invoiceNumber).toBe("INV-000002");

    const issuedEvents = events.filter(event => event.type === "billing.invoice.issued");
    expect(issuedEvents.length).toBe(2);
  });

  it("rejects issuing an invoice that is not in draft", async () => {
    const { hyprpay } = setup();

    const order = unwrapOk(await hyprpay.api.orders.create(baseOrderInput()));
    const invoice = await issueFor(hyprpay, order);

    const reissue = await hyprpay.api.orders.issueInvoice(invoice.id);
    expect(Result.isError(reissue)).toBe(true);
  });

  it("returns NOT_FOUND when drafting an invoice for a missing order", async () => {
    const { hyprpay } = setup();

    const result = await hyprpay.api.orders.draftInvoice({ orderId: "missing" });
    expect(Result.isError(result)).toBe(true);
  });

  it("gets and lists invoices by order and customer", async () => {
    const { hyprpay } = setup();

    const order = unwrapOk(await hyprpay.api.orders.create(baseOrderInput()));
    const invoice = await issueFor(hyprpay, order);

    const fetched = unwrapOk(await hyprpay.api.orders.getInvoice(invoice.id));
    expect(fetched?.id).toBe(invoice.id);

    const byOrder = unwrapOk(await hyprpay.api.orders.listInvoices({ orderId: order.id }));
    expect(byOrder.length).toBe(1);

    const byCustomer = unwrapOk(
      await hyprpay.api.orders.listInvoices({ customerId: "cust_123" }),
    );
    expect(byCustomer.length).toBe(1);

    const missing = unwrapOk(await hyprpay.api.orders.getInvoice("missing"));
    expect(missing).toBeNull();
  });
});
