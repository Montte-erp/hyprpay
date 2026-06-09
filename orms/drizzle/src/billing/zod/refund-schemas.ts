import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { billingRefunds } from "../tables/billing-refunds.table";

export const billingRefundDbInsertSchema = createInsertSchema(billingRefunds);
export const billingRefundDbSelectSchema = createSelectSchema(billingRefunds);
export const billingRefundDbUpdateSchema = createUpdateSchema(billingRefunds);
