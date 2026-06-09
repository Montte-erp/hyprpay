import { z } from "zod";
import { metadataSchema } from "./shared-schema";

export const meterAggregationSchema = z.enum([
  "sum",
  "count",
  "max",
  "last",
  "average",
  "min",
  "unique",
]);

/**
 * Simple property-equals filter clauses applied over a meter event's
 * `metadata`. An event is kept only when EVERY clause matches
 * (`event.metadata[key] === value`). Values are strings because event
 * metadata is `Record<string, string>` (see `metadataSchema`).
 */
export const meterFilterSchema = z.record(z.string(), z.string()).default({});

export const meterInputSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  eventName: z.string().min(1),
  aggregation: meterAggregationSchema.default("sum"),
  valueProperty: z.string().optional(),
  /**
   * Property-equals clauses applied to each event's metadata before
   * aggregation. Empty `{}` means "no filtering beyond eventName".
   */
  filters: meterFilterSchema,
  active: z.boolean().default(true),
  metadata: metadataSchema.optional(),
});

export const meterSchema = meterInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
});

export const meterEventInputSchema = z.object({
  meterId: z.string().min(1),
  customerId: z.string().min(1),
  subscriptionId: z.string().optional(),
  value: z.number().nonnegative().default(1),
  timestamp: z.string().optional(),
  idempotencyKey: z.string().optional(),
  metadata: metadataSchema.optional(),
});

export const meterEventSchema = meterEventInputSchema.extend({
  id: z.string().min(1),
  timestamp: z.string().min(1),
});

export const usageSnapshotSchema = z.object({
  id: z.string().min(1),
  meterId: z.string().min(1),
  subscriptionId: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  aggregatedValue: z.number(),
  createdAt: z.string().min(1),
});

/**
 * Per-customer, per-meter credit ledger. `granted` is the total credit
 * granted; `consumed` is what has been drawn down by ingested events.
 * `balance` = granted - consumed (read-side, never negative below 0 on read).
 */
export const meterCreditSchema = z.object({
  id: z.string().min(1),
  meterId: z.string().min(1),
  customerId: z.string().min(1),
  granted: z.number().nonnegative(),
  consumed: z.number().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const meterCreditGrantInputSchema = z.object({
  meterId: z.string().min(1),
  customerId: z.string().min(1),
  amount: z.number().positive(),
  metadata: metadataSchema.optional(),
});

export const meterBalanceSchema = z.object({
  meterId: z.string().min(1),
  customerId: z.string().min(1),
  granted: z.number().nonnegative(),
  consumed: z.number().nonnegative(),
  balance: z.number(),
});

export const meterQuantityBucketSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  value: z.number(),
});

export const meterQuantitiesSchema = z.object({
  meterId: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  interval: z.enum(["hour", "day", "week", "month"]),
  buckets: z.array(meterQuantityBucketSchema),
});

export type MeterAggregation = z.infer<typeof meterAggregationSchema>;
export type MeterFilter = z.infer<typeof meterFilterSchema>;
export type MeterInput = z.infer<typeof meterInputSchema>;
export type Meter = z.infer<typeof meterSchema>;
export type MeterEventInput = z.infer<typeof meterEventInputSchema>;
export type MeterEvent = z.infer<typeof meterEventSchema>;
export type UsageSnapshot = z.infer<typeof usageSnapshotSchema>;
export type MeterCredit = z.infer<typeof meterCreditSchema>;
export type MeterCreditGrantInput = z.infer<typeof meterCreditGrantInputSchema>;
export type MeterBalance = z.infer<typeof meterBalanceSchema>;
export type MeterQuantityBucket = z.infer<typeof meterQuantityBucketSchema>;
export type MeterQuantities = z.infer<typeof meterQuantitiesSchema>;
export type MeterQuantitiesInterval = MeterQuantities["interval"];
