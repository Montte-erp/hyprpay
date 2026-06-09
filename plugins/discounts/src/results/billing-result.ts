import type { Result } from "better-result";
import type { BillingError } from "../errors/core-errors";

export type BillingResult<T> = Result<T, BillingError>;
