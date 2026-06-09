import { and, eq, sql } from "drizzle-orm";
import { Result } from "better-result";
import type {
  BillingResult,
  Invoice,
  InvoicesListFilter,
  Order,
  OrderLine,
  OrdersDatabaseAdapter,
  OrdersListFilter,
} from "../orders-plugin";
import { BillingError, billingErrors, invoiceSchema, orderSchema } from "../orders-plugin";
import type { BillingPgDatabase } from "./drizzle-adapter";
import { billingSchema } from "./billing-schema";
import { drizzleQueryError } from "./errors/drizzle-errors";
import { billingOrderLineDbInsertSchema, billingOrderDbInsertSchema } from "./zod/order-schemas";

export interface DrizzleOrdersAdapterOptions {
  schema?: typeof billingSchema;
}

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

type OrderRow = typeof billingSchema.billingOrders.$inferSelect;
type OrderLineRow = typeof billingSchema.billingOrderLines.$inferSelect;
type InvoiceRow = typeof billingSchema.billingInvoices.$inferSelect;

const mapInvoice = (record: InvoiceRow): Invoice | null => {
  const parsed = invoiceSchema.safeParse({
    id: record.id,
    orderId: record.orderId,
    customerId: record.customerId,
    status: record.status,
    currency: record.currency,
    amount: record.amount,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    ...(record.invoiceNumber !== null ? { invoiceNumber: record.invoiceNumber } : {}),
    ...(record.billingName !== null ? { billingName: record.billingName } : {}),
    ...(record.billingAddress !== null ? { billingAddress: record.billingAddress } : {}),
    ...(record.issuedAt !== null ? { issuedAt: record.issuedAt } : {}),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const invoiceValues = (input: Invoice) => ({
  id: input.id,
  orderId: input.orderId,
  customerId: input.customerId,
  status: input.status,
  currency: input.currency,
  amount: input.amount,
  metadata: input.metadata ?? {},
  invoiceNumber: input.invoiceNumber ?? null,
  billingName: input.billingName ?? null,
  billingAddress: input.billingAddress ?? null,
  issuedAt: input.issuedAt ?? null,
});

const mapOrder = (record: OrderRow, lines: OrderLineRow[]): Order | null => {
  const items: OrderLine[] = lines.map(line => ({
    id: line.id,
    label: line.label,
    type: line.type as OrderLine["type"],
    quantity: line.quantity,
    unitAmount: line.unitAmount,
    amount: line.amount,
    ...(line.priceId !== null ? { priceId: line.priceId } : {}),
  }));

  const parsed = orderSchema.safeParse({
    id: record.id,
    customerId: record.customerId,
    status: record.status,
    billingReason: record.billingReason,
    currency: record.currency,
    items,
    subtotalAmount: record.subtotalAmount,
    discountAmount: record.discountAmount,
    taxAmount: record.taxAmount,
    totalAmount: record.totalAmount,
    amountRefunded: record.amountRefunded,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    ...(record.checkoutId !== null ? { checkoutId: record.checkoutId } : {}),
    ...(record.subscriptionId !== null ? { subscriptionId: record.subscriptionId } : {}),
    ...(record.providerOrderId !== null ? { providerOrderId: record.providerOrderId } : {}),
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const orderLineValues = (order: Order, line: OrderLine) => ({
  id: line.id,
  orderId: order.id,
  label: line.label,
  type: line.type,
  quantity: line.quantity,
  unitAmount: line.unitAmount,
  amount: line.amount,
  ...(line.priceId !== undefined ? { priceId: line.priceId } : {}),
});

export const drizzleOrdersAdapter = (
  db: BillingPgDatabase,
  options: DrizzleOrdersAdapterOptions = {},
): OrdersDatabaseAdapter => {
  const schema = options.schema ?? billingSchema;

  const loadLines = (orderId: string) =>
    runQuery("load order lines", async () =>
      db.select().from(schema.billingOrderLines).where(eq(schema.billingOrderLines.orderId, orderId)),
    );

  return {
    orders: {
      create: async (input: Order) => {
        const orderToStore = billingOrderDbInsertSchema.parse(input);
        const result = await runQuery("create order", async () => {
          const rows = await db.insert(schema.billingOrders).values(orderToStore).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Pedido não foi persistido.");
        }

        if (input.items.length > 0) {
          const lineValues = input.items.map(line =>
            billingOrderLineDbInsertSchema.parse(orderLineValues(input, line)),
          );

          const insertLinesResult = await runQuery("create order lines", async () =>
            db.insert(schema.billingOrderLines).values(lineValues).returning(),
          );

          if (Result.isError(insertLinesResult)) {
            return Result.err(insertLinesResult.error);
          }
        }

        const linesResult = await loadLines(input.id);

        if (Result.isError(linesResult)) {
          return Result.err(linesResult.error);
        }

        const order = mapOrder(result.value, linesResult.value);

        if (order === null) {
          return invalidStoredRecord("Pedido persistido com shape inválido.");
        }

        return Result.ok(order);
      },
      findById: async (id: string) => {
        const result = await runQuery("find order", async () => {
          const rows = await db
            .select()
            .from(schema.billingOrders)
            .where(eq(schema.billingOrders.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const linesResult = await loadLines(id);

        if (Result.isError(linesResult)) {
          return Result.err(linesResult.error);
        }

        const order = mapOrder(result.value, linesResult.value);

        if (order === null) {
          return invalidStoredRecord("Pedido persistido com shape inválido.");
        }

        return Result.ok(order);
      },
      update: async (input: Order) => {
        const result = await runQuery("update order", async () => {
          const rows = await db
            .update(schema.billingOrders)
            .set({
              status: input.status,
              billingReason: input.billingReason,
              currency: input.currency,
              subtotalAmount: input.subtotalAmount,
              discountAmount: input.discountAmount,
              taxAmount: input.taxAmount,
              totalAmount: input.totalAmount,
              amountRefunded: input.amountRefunded,
              metadata: input.metadata ?? {},
              checkoutId: input.checkoutId ?? null,
              subscriptionId: input.subscriptionId ?? null,
              providerOrderId: input.providerOrderId ?? null,
              updatedAt: new Date(),
            })
            .where(eq(schema.billingOrders.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Pedido não foi atualizado.");
        }

        const linesResult = await loadLines(input.id);

        if (Result.isError(linesResult)) {
          return Result.err(linesResult.error);
        }

        const order = mapOrder(result.value, linesResult.value);

        if (order === null) {
          return invalidStoredRecord("Pedido persistido com shape inválido.");
        }

        return Result.ok(order);
      },
      list: async (filter: OrdersListFilter) => {
        const conditions = [
          ...(filter.customerId !== undefined
            ? [eq(schema.billingOrders.customerId, filter.customerId)]
            : []),
          ...(filter.subscriptionId !== undefined
            ? [eq(schema.billingOrders.subscriptionId, filter.subscriptionId)]
            : []),
        ];

        const result = await runQuery("list orders", async () =>
          db.select().from(schema.billingOrders).where(and(...conditions)),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const orders: Order[] = [];

        for (const row of result.value) {
          const linesResult = await loadLines(row.id);

          if (Result.isError(linesResult)) {
            return Result.err(linesResult.error);
          }

          const order = mapOrder(row, linesResult.value);

          if (order === null) {
            return invalidStoredRecord("Pedido persistido com shape inválido.");
          }

          orders.push(order);
        }

        return Result.ok(orders);
      },
    },
    invoices: {
      create: async (input: Invoice) => {
        const result = await runQuery("create invoice", async () => {
          const rows = await db.insert(schema.billingInvoices).values(invoiceValues(input)).returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Fatura não foi persistida.");
        }

        const invoice = mapInvoice(result.value);

        if (invoice === null) {
          return invalidStoredRecord("Fatura persistida com shape inválido.");
        }

        return Result.ok(invoice);
      },
      findById: async (id: string) => {
        const result = await runQuery("find invoice", async () => {
          const rows = await db
            .select()
            .from(schema.billingInvoices)
            .where(eq(schema.billingInvoices.id, id))
            .limit(1);
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return Result.ok(null);
        }

        const invoice = mapInvoice(result.value);

        if (invoice === null) {
          return invalidStoredRecord("Fatura persistida com shape inválido.");
        }

        return Result.ok(invoice);
      },
      update: async (input: Invoice) => {
        const result = await runQuery("update invoice", async () => {
          const rows = await db
            .update(schema.billingInvoices)
            .set({
              status: input.status,
              currency: input.currency,
              amount: input.amount,
              metadata: input.metadata ?? {},
              invoiceNumber: input.invoiceNumber ?? null,
              billingName: input.billingName ?? null,
              billingAddress: input.billingAddress ?? null,
              issuedAt: input.issuedAt ?? null,
            })
            .where(eq(schema.billingInvoices.id, input.id))
            .returning();
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Fatura não foi atualizada.");
        }

        const invoice = mapInvoice(result.value);

        if (invoice === null) {
          return invalidStoredRecord("Fatura persistida com shape inválido.");
        }

        return Result.ok(invoice);
      },
      list: async (filter: InvoicesListFilter) => {
        const conditions = [
          ...(filter.orderId !== undefined ? [eq(schema.billingInvoices.orderId, filter.orderId)] : []),
          ...(filter.customerId !== undefined
            ? [eq(schema.billingInvoices.customerId, filter.customerId)]
            : []),
        ];

        const result = await runQuery("list invoices", async () =>
          db.select().from(schema.billingInvoices).where(and(...conditions)),
        );

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        const invoices: Invoice[] = [];

        for (const row of result.value) {
          const invoice = mapInvoice(row);

          if (invoice === null) {
            return invalidStoredRecord("Fatura persistida com shape inválido.");
          }

          invoices.push(invoice);
        }

        return Result.ok(invoices);
      },
      nextInvoiceNumber: async () => {
        // Atomic reserve: INSERT the namespace counter if absent, otherwise
        // increment in place. RETURNING last_value yields the reserved number.
        const result = await runQuery("reserve next invoice number", async () => {
          const rows = await db
            .insert(schema.billingInvoiceSequences)
            .values({ namespace: "default", lastValue: 1 })
            .onConflictDoUpdate({
              target: schema.billingInvoiceSequences.namespace,
              set: { lastValue: sql`${schema.billingInvoiceSequences.lastValue} + 1` },
            })
            .returning({ lastValue: schema.billingInvoiceSequences.lastValue });
          return firstRow(rows);
        });

        if (Result.isError(result)) {
          return Result.err(result.error);
        }

        if (result.value === null) {
          return invalidStoredRecord("Número de fatura não pôde ser reservado.");
        }

        return Result.ok(result.value.lastValue);
      },
    },
  };
};
