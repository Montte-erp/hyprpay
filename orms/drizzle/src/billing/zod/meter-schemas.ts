import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { billingMeterEvents } from "../tables/billing-meter-events.table";
import { billingMeters } from "../tables/billing-meters.table";
import { billingUsageSnapshots } from "../tables/billing-usage-snapshots.table";

export const billingMeterDbInsertSchema = createInsertSchema(billingMeters);
export const billingMeterDbSelectSchema = createSelectSchema(billingMeters);
export const billingMeterDbUpdateSchema = createUpdateSchema(billingMeters);

export const billingMeterEventDbInsertSchema = createInsertSchema(billingMeterEvents);
export const billingMeterEventDbSelectSchema = createSelectSchema(billingMeterEvents);
export const billingMeterEventDbUpdateSchema = createUpdateSchema(billingMeterEvents);

export const billingUsageSnapshotDbInsertSchema = createInsertSchema(billingUsageSnapshots);
export const billingUsageSnapshotDbSelectSchema = createSelectSchema(billingUsageSnapshots);
export const billingUsageSnapshotDbUpdateSchema = createUpdateSchema(billingUsageSnapshots);
