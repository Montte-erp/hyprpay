import type { Result } from "better-result";
import type { EntitlementError } from "./entitlement-errors";

export type EntitlementResult<T> = Result<T, EntitlementError>;
