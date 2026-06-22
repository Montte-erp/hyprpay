import { Effect } from "effect";
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import { createCustomerRecord } from "../internal/records";
import { captureTelemetry } from "../internal/telemetry";
import { decodeCustomerInput, type Customer, type CustomerInput } from "../schemas";
import type { BillingEffect } from "../store";

export const createCustomerApi = (options: CreateHyprPayOptions) => ({
  create: (input: CustomerInput): BillingEffect<Customer> => Effect.gen(function* () {
    const parsed = yield* decodeCustomerInput(input);
    const customer = createCustomerRecord(parsed);
    const providerRef =
      options.provider?.capabilities.customers === true
        ? yield* options.provider.createCustomer({
            ...parsed,
            externalId: parsed.externalId ?? customer.id,
          })
        : undefined;

    const created = yield* options.store.customers.create(
      providerRef === undefined
        ? customer
        : {
            ...customer,
            provider: providerRef.provider,
            providerCustomerId: providerRef.providerCustomerId,
          },
    );
    yield* captureTelemetry(options, "customer.created", {
      provider: created.provider ?? "none",
    });
    return created;
  }),
  get: (customerId: string): BillingEffect<Customer | null> => options.store.customers.findById(customerId),
  findByExternalId: (externalId: string): BillingEffect<Customer | null> =>
    options.store.customers.list({ externalId }).pipe(Effect.map(customers => customers[0] ?? null)),
});

export const customersPlugin = defineHyprPayPlugin({
  id: "customers",
  build: createCustomerApi,
});
