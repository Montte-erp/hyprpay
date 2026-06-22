import { Effect } from "effect";
import { decodeMeterRecordInput,
decodeMeterSummaryInput,
type MeterRecordInput,
type MeterSummaryInput,
type MeterSummaryResult, } from "../meters/schema"
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import { createUsageRecord } from "../internal/records";
import type { UsageRecord } from "../schemas";
import type { BillingEffect } from "../store";

export const createMetersApi = (options: CreateHyprPayOptions) => ({
  record: (input: MeterRecordInput): BillingEffect<UsageRecord> => Effect.gen(function* () {
    const parsed = yield* decodeMeterRecordInput(input);

    if (parsed.idempotencyKey !== undefined) {
      const existing = yield* options.store.usageRecords.list({
        customerId: parsed.customerId,
        meterId: parsed.meterId,
        idempotencyKey: parsed.idempotencyKey,
      });
      const record = existing[0];

      if (record !== undefined) {
        return record;
      }
    }

    return yield* options.store.usageRecords.create(createUsageRecord(parsed));
  }),
  summarize: (input: MeterSummaryInput): BillingEffect<MeterSummaryResult> => Effect.gen(function* () {
    const parsed = yield* decodeMeterSummaryInput(input);
    const records = yield* options.store.usageRecords.list({
      customerId: parsed.customerId,
      meterId: parsed.meterId,
    });

    return {
      customerId: parsed.customerId,
      meterId: parsed.meterId,
      amount: records.reduce((total, record) => total + record.amount, 0),
    };
  }),
});

export const metersPlugin = defineHyprPayPlugin({
  id: "meters",
  build: createMetersApi,
});
