import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { billingPrices } from "../tables/billing-prices.table";

export const billingPriceDbInsertSchema = createInsertSchema(billingPrices);
export const billingPriceDbSelectSchema = createSelectSchema(billingPrices);
export const billingPriceDbUpdateSchema = createUpdateSchema(billingPrices);

/** @deprecated use billingPriceDbInsertSchema */
export { billingPriceDbInsertSchema as billingPriceInsertSchema };
/** @deprecated use billingPriceDbSelectSchema */
export { billingPriceDbSelectSchema as billingPriceSelectSchema };
/** @deprecated use billingPriceDbUpdateSchema */
export { billingPriceDbUpdateSchema as billingPriceUpdateSchema };
