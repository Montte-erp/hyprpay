import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { billingOrderLines } from "../tables/billing-order-lines.table";
import { billingOrders } from "../tables/billing-orders.table";

export const billingOrderDbInsertSchema = createInsertSchema(billingOrders);
export const billingOrderDbSelectSchema = createSelectSchema(billingOrders);
export const billingOrderDbUpdateSchema = createUpdateSchema(billingOrders);

export const billingOrderLineDbInsertSchema = createInsertSchema(billingOrderLines);
export const billingOrderLineDbSelectSchema = createSelectSchema(billingOrderLines);
export const billingOrderLineDbUpdateSchema = createUpdateSchema(billingOrderLines);
