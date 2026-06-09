import { TaggedError } from "better-result";

export interface EntitlementErrorEntry {
  status: number;
  message: string;
  tags?: string[];
}

export class EntitlementError extends TaggedError("EntitlementError")<{
  error: EntitlementErrorEntry;
  message: string;
  status?: number;
}>() {}
