import type { BillingAddress, Customer } from "../../billing-plugin"

export interface BillingCustomerRecord {
  id: string;
  providerCustomerId: string | null;
  externalId: string | null;
  name: string;
  email: string;
  document: string;
  documentType: string;
  phone: string | null;
  taxId: string | null;
  billingAddress: BillingAddress | null;
  metadata: Record<string, string>;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: string | null;
}

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;

export const mapCustomerRecord = (record: BillingCustomerRecord): Customer => ({
  id: record.id,
  providerCustomerId: record.providerCustomerId ?? undefined,
  ...(record.externalId !== null ? { externalId: record.externalId } : {}),
  name: record.name,
  email: record.email,
  document: record.document,
  documentType: record.documentType as Customer["documentType"],
  phone: record.phone ?? undefined,
  ...(record.taxId !== null ? { taxId: record.taxId } : {}),
  ...(record.billingAddress !== null ? { billingAddress: record.billingAddress } : {}),
  metadata: record.metadata,
  createdAt: toIso(record.createdAt),
  updatedAt: toIso(record.updatedAt),
  ...(record.deletedAt !== null ? { deletedAt: record.deletedAt } : {}),
});
