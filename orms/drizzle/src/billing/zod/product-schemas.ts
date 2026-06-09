import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { billingProducts } from "../tables/billing-products.table";

export const billingProductDbInsertSchema = createInsertSchema(billingProducts);
export const billingProductDbSelectSchema = createSelectSchema(billingProducts);
export const billingProductDbUpdateSchema = createUpdateSchema(billingProducts);

/** @deprecated use billingProductDbInsertSchema */
export { billingProductDbInsertSchema as billingProductInsertSchema };
/** @deprecated use billingProductDbSelectSchema */
export { billingProductDbSelectSchema as billingProductSelectSchema };
/** @deprecated use billingProductDbUpdateSchema */
export { billingProductDbUpdateSchema as billingProductUpdateSchema };
