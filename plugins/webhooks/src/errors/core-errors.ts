import { TaggedError } from "better-result";

export interface BillingErrorEntry {
  status: number;
  message: string;
  tags?: string[];
}

export class BillingError extends TaggedError("BillingError")<{
  error: BillingErrorEntry;
  message: string;
  provider?: string;
  status?: number;
}>() {}
