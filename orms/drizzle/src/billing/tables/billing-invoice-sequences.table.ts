import { integer, pgSchema, text } from "drizzle-orm/pg-core";

const billing = pgSchema("billing");

/**
 * Monotonic invoice-number counter, one row per namespace. `nextInvoiceNumber`
 * reserves the next value with an atomic `UPDATE ... RETURNING` so concurrent
 * issues never collide.
 */
export const billingInvoiceSequences = billing.table("invoice_sequences", {
  namespace: text("namespace").primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
});
