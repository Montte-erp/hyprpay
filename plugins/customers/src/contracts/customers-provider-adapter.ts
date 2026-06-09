import type { BillingResult } from "../results/billing-result";
import type { Customer, CustomerInput } from "../schemas/customer-schema";

/**
 * Shape the provider returns from `createCustomer`. The provider only owns
 * PSP-level fields (ids, normalized name/email/document, providerCustomerId);
 * the plugin owns `documentType` and the `createdAt`/`updatedAt` timestamps and
 * always overwrites them after the provider call. Those plugin-managed fields
 * are therefore optional here so a gateway never has to fabricate them.
 */
export type ProviderCustomer = Omit<
  Customer,
  "documentType" | "createdAt" | "updatedAt" | "deletedAt"
> & {
  documentType?: Customer["documentType"];
  createdAt?: string;
  updatedAt?: string;
};

export interface CustomersProviderAdapter {
  id: string;
  createCustomer(input: CustomerInput): Promise<BillingResult<ProviderCustomer>>;
}
