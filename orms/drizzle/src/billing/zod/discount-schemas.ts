import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { billingDiscounts } from "../tables/billing-discounts.table";

export const billingDiscountDbInsertSchema = createInsertSchema(billingDiscounts);
export const billingDiscountDbSelectSchema = createSelectSchema(billingDiscounts);
export const billingDiscountDbUpdateSchema = createUpdateSchema(billingDiscounts);
