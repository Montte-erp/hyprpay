import { Result } from "better-result";
import type { HyprPayPlugin, HyprPayRuntime } from "@hyprpay/core";
import type {
  CustomersDatabaseAdapter,
  CustomersLookupAdapter,
} from "./contracts/customers-database-adapter";
import type { CustomersProviderAdapter } from "./contracts/customers-provider-adapter";
import { billingErrors } from "./errors/core-error-catalog";
import { BillingError } from "./errors/core-errors";
import type { BillingResult } from "./results/billing-result";
import type {
  BillingAddress,
  Customer,
  CustomerInput,
  CustomerListFilter,
  CustomerListFilterInput,
  CustomerUpdate,
} from "./schemas/customer-schema";
import {
  customerInputSchema,
  customerListFilterSchema,
  customerSchema,
  customerUpdateSchema,
} from "./schemas/customer-schema";
import {
  billingAddressSchema,
  detectDocumentType,
  documentTypeSchema,
  metadataSchema,
} from "./schemas/shared-schema";

export interface CustomersApi {
  create(input: CustomerInput): Promise<BillingResult<Customer>>;
  getById(id: string): Promise<BillingResult<Customer | null>>;
  getByExternalId(externalId: string): Promise<BillingResult<Customer | null>>;
  list(filter?: CustomerListFilterInput): Promise<BillingResult<Customer[]>>;
  update(id: string, input: CustomerUpdate): Promise<BillingResult<Customer>>;
  updateByExternalId(
    externalId: string,
    input: CustomerUpdate,
  ): Promise<BillingResult<Customer>>;
  softDelete(id: string): Promise<BillingResult<Customer>>;
}

export interface CustomersPluginOptions {
  database: CustomersDatabaseAdapter;
  provider: CustomersProviderAdapter;
}

export type CustomerPluginEvent =
  | { type: "billing.customer.created"; payload: Customer }
  | { type: "billing.customer.updated"; payload: Customer }
  | { type: "billing.customer.deleted"; payload: Customer };

const invalidBillingInput = <T>(message = "Dados de billing inválidos."): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.INVALID_INPUT(),
      message,
    }),
  );

const notFound = <T>(message = "Cliente de billing não encontrado."): BillingResult<T> =>
  Result.err(
    new BillingError({
      error: billingErrors.NOT_FOUND(),
      message,
    }),
  );

const emitCustomerEvent = async (runtime: HyprPayRuntime, event: CustomerPluginEvent) => {
  await runtime.emit(event);
};

/**
 * Apply a validated PATCH payload onto an existing customer record. Omitted
 * fields are left untouched; `document` changes re-derive `documentType`;
 * timestamps and identity fields are preserved.
 */
const applyUpdate = (existing: Customer, patch: CustomerUpdate, now: string): Customer => {
  const next: Customer = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.document !== undefined
      ? { document: patch.document, documentType: detectDocumentType(patch.document) }
      : {}),
    ...(patch.externalId !== undefined ? { externalId: patch.externalId } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    ...(patch.taxId !== undefined ? { taxId: patch.taxId } : {}),
    ...(patch.billingAddress !== undefined ? { billingAddress: patch.billingAddress } : {}),
    ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
    updatedAt: now,
  };

  return next;
};

export const customers = (
  options: CustomersPluginOptions,
): HyprPayPlugin<"customers", CustomersApi> => ({
  id: "customers",
  namespace: "customers",
  extendApi: runtime => {
    const updateExisting = async (
      existing: Customer,
      input: CustomerUpdate,
    ): Promise<BillingResult<Customer>> => {
      const parsed = customerUpdateSchema.safeParse(input);

      if (!parsed.success) {
        return invalidBillingInput();
      }

      const next = applyUpdate(existing, parsed.data, new Date().toISOString());
      const updatedResult = await options.database.customers.update(next);

      if (Result.isError(updatedResult)) {
        return Result.err(updatedResult.error);
      }

      await emitCustomerEvent(runtime, {
        type: "billing.customer.updated",
        payload: updatedResult.value,
      });

      return updatedResult;
    };

    return {
      create: async (input: CustomerInput) => {
        const parsed = customerInputSchema.safeParse(input);

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const providerResult = await options.provider.createCustomer(parsed.data);

        if (Result.isError(providerResult)) {
          return Result.err(providerResult.error);
        }

        const now = new Date().toISOString();

        const customerResult = await options.database.customers.create({
          ...providerResult.value,
          documentType: detectDocumentType(providerResult.value.document),
          createdAt: now,
          updatedAt: now,
          ...(parsed.data.externalId !== undefined ? { externalId: parsed.data.externalId } : {}),
          ...(parsed.data.taxId !== undefined ? { taxId: parsed.data.taxId } : {}),
          ...(parsed.data.billingAddress !== undefined
            ? { billingAddress: parsed.data.billingAddress }
            : {}),
        });

        if (Result.isError(customerResult)) {
          return Result.err(customerResult.error);
        }

        await emitCustomerEvent(runtime, {
          type: "billing.customer.created",
          payload: customerResult.value,
        });

        return customerResult;
      },
      getById: async (id: string) => options.database.customers.findById(id),
      getByExternalId: async (externalId: string) =>
        options.database.customers.findByExternalId(externalId),
      list: async (filter?: CustomerListFilterInput) => {
        const parsed = customerListFilterSchema.safeParse(filter ?? {});

        if (!parsed.success) {
          return invalidBillingInput();
        }

        const normalized: CustomerListFilter = {
          includeDeleted: parsed.data.includeDeleted,
          limit: parsed.data.limit,
          offset: parsed.data.offset,
          ...(parsed.data.search !== undefined ? { search: parsed.data.search } : {}),
          ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
          ...(parsed.data.externalId !== undefined ? { externalId: parsed.data.externalId } : {}),
        };

        return options.database.customers.list(normalized);
      },
      update: async (id: string, input: CustomerUpdate) => {
        const existingResult = await options.database.customers.findById(id);

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound();
        }

        return updateExisting(existingResult.value, input);
      },
      updateByExternalId: async (externalId: string, input: CustomerUpdate) => {
        const existingResult = await options.database.customers.findByExternalId(externalId);

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound();
        }

        return updateExisting(existingResult.value, input);
      },
      softDelete: async (id: string) => {
        const existingResult = await options.database.customers.findById(id);

        if (Result.isError(existingResult)) {
          return Result.err(existingResult.error);
        }

        if (existingResult.value === null) {
          return notFound();
        }

        if (existingResult.value.deletedAt !== undefined) {
          return invalidBillingInput("Cliente de billing já foi removido.");
        }

        const now = new Date().toISOString();
        const deletedCustomer: Customer = {
          ...existingResult.value,
          deletedAt: now,
          updatedAt: now,
        };

        const deletedResult = await options.database.customers.update(deletedCustomer);

        if (Result.isError(deletedResult)) {
          return Result.err(deletedResult.error);
        }

        await emitCustomerEvent(runtime, {
          type: "billing.customer.deleted",
          payload: deletedResult.value,
        });

        return deletedResult;
      },
    };
  },
});

export {
  createCustomerStateWatcher,
  createGetCustomerState,
} from "./customer-state";
export type {
  CustomerState,
  CustomerStateChangedEvent,
  CustomerStateCustomersPort,
  CustomerStateDependencies,
  CustomerStateEntitlement,
  CustomerStateEntitlementsPort,
  CustomerStateMeterBalance,
  CustomerStateMetersPort,
  CustomerStateOrder,
  CustomerStateOrdersPort,
  CustomerStateSubscription,
  CustomerStateSubscriptionsPort,
  CustomerStateWatcher,
  GetCustomerState,
  GetCustomerStateOptions,
} from "./customer-state";
export type {
  BillingResult,
  CustomersDatabaseAdapter,
  CustomersLookupAdapter,
  CustomersProviderAdapter,
};
export { BillingError } from "./errors/core-errors";
export { billingErrors } from "./errors/core-error-catalog";
export {
  customerInputSchema,
  customerListFilterSchema,
  customerSchema,
  customerUpdateSchema,
};
export type {
  BillingAddress,
  Customer,
  CustomerInput,
  CustomerListFilter,
  CustomerListFilterInput,
  CustomerUpdate,
};
export { billingAddressSchema, detectDocumentType, documentTypeSchema, metadataSchema };
