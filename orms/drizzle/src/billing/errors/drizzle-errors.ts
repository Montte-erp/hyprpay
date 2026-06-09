import { BillingError } from "../../billing-plugin"
import { billingErrors } from "../../billing-plugin"
import { drizzleErrors } from "./drizzle-error-catalog";

export const drizzleQueryError = (message: string) =>
  new BillingError({
    error: billingErrors.DATABASE_REQUEST_FAILED(),
    message: `${drizzleErrors.QUERY_FAILED().message} ${message}`,
  });
