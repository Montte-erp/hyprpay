import type { BillingResult } from "../results/billing-result";
import type { Customer, CustomerListFilter } from "../schemas/customer-schema";

export interface CustomersDatabaseAdapter {
  customers: {
    create(input: Customer): Promise<BillingResult<Customer>>;
    findById(id: string): Promise<BillingResult<Customer | null>>;
    findByExternalId(externalId: string): Promise<BillingResult<Customer | null>>;
    update(input: Customer): Promise<BillingResult<Customer>>;
    list(filter: CustomerListFilter): Promise<BillingResult<Customer[]>>;
  };
}

export type CustomersLookupAdapter = Pick<CustomersDatabaseAdapter, "customers">;
