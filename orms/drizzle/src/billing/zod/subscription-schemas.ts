import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { billingSubscriptions } from "../tables/billing-subscriptions.table";

export const billingSubscriptionDbInsertSchema = createInsertSchema(billingSubscriptions);
export const billingSubscriptionDbSelectSchema = createSelectSchema(billingSubscriptions);
export const billingSubscriptionDbUpdateSchema = createUpdateSchema(billingSubscriptions);

/** @deprecated use billingSubscriptionDbInsertSchema */
export { billingSubscriptionDbInsertSchema as billingSubscriptionInsertSchema };
/** @deprecated use billingSubscriptionDbSelectSchema */
export { billingSubscriptionDbSelectSchema as billingSubscriptionSelectSchema };
/** @deprecated use billingSubscriptionDbUpdateSchema */
export { billingSubscriptionDbUpdateSchema as billingSubscriptionUpdateSchema };
