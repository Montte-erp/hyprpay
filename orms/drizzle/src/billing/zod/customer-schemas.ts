import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { billingCustomers } from "../tables/billing-customers.table";

export const billingCustomerDbInsertSchema = createInsertSchema(billingCustomers);
export const billingCustomerDbSelectSchema = createSelectSchema(billingCustomers);
export const billingCustomerDbUpdateSchema = createUpdateSchema(billingCustomers);

/** @deprecated use billingCustomerDbInsertSchema */
export { billingCustomerDbInsertSchema as billingCustomerInsertSchema };
/** @deprecated use billingCustomerDbSelectSchema */
export { billingCustomerDbSelectSchema as billingCustomerSelectSchema };
/** @deprecated use billingCustomerDbUpdateSchema */
export { billingCustomerDbUpdateSchema as billingCustomerUpdateSchema };
