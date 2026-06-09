import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
  customerInputSchema,
  customerListFilterSchema,
  customerUpdateSchema,
} from "@hyprpay/customers";
import { unwrap } from "../error/billing-result-to-orpc-error";
import { billingProcedure } from "../procedure";

const createCustomer = billingProcedure
  .route({ method: "POST", path: "/billing/customers" })
  .input(customerInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.customers.create(input)));

const getCustomer = billingProcedure
  .route({ method: "GET", path: "/billing/customers/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.customers.getById(input.params.id)),
  );

const getCustomerByExternalId = billingProcedure
  .route({
    method: "GET",
    path: "/billing/customers/external/{externalId}",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ externalId: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.customers.getByExternalId(input.params.externalId)),
  );

const listCustomers = billingProcedure
  .route({ method: "GET", path: "/billing/customers", inputStructure: "detailed" })
  .input(
    z.object({
      query: customerListFilterSchema.partial(),
    }),
  )
  .handler(async ({ context, input }) => {
    // exactOptionalPropertyTypes: build the filter without assigning explicit undefined.
    const filter = {
      ...(input.query.search !== undefined ? { search: input.query.search } : {}),
      ...(input.query.email !== undefined ? { email: input.query.email } : {}),
      ...(input.query.externalId !== undefined ? { externalId: input.query.externalId } : {}),
      ...(input.query.includeDeleted !== undefined
        ? { includeDeleted: input.query.includeDeleted }
        : {}),
      ...(input.query.limit !== undefined ? { limit: input.query.limit } : {}),
      ...(input.query.offset !== undefined ? { offset: input.query.offset } : {}),
    };

    return unwrap(await context.api.customers.list(filter));
  });

const updateCustomer = billingProcedure
  .route({ method: "PATCH", path: "/billing/customers/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
      body: customerUpdateSchema,
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.customers.update(input.params.id, input.body)),
  );

const updateCustomerByExternalId = billingProcedure
  .route({
    method: "PATCH",
    path: "/billing/customers/external/{externalId}",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ externalId: z.string().min(1) }),
      body: customerUpdateSchema,
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.customers.updateByExternalId(input.params.externalId, input.body),
    ),
  );

const deleteCustomer = billingProcedure
  .route({ method: "DELETE", path: "/billing/customers/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.customers.softDelete(input.params.id)),
  );

/**
 * Customer-scoped composite read: the customer + active subscriptions + granted
 * entitlements/benefits + meter balances + recent orders, composed from the read
 * apis the lanes exposed (see `@hyprpay/customers` `createCustomerStateWatcher`).
 *
 * Runs on the base `billingProcedure`; the customer identity comes from the
 * `{id}` path param (a customer id OR external id — the aggregator resolves
 * both). The library does not enforce auth here — the host wraps this with its
 * own auth (e.g. `authedProcedure`/`customerProcedure`) if it wants scoping.
 * Emits `billing.customer.state_changed` when the snapshot changes.
 */
const getCustomerStateRoute = billingProcedure
  .route({
    method: "GET",
    path: "/billing/customers/{id}/state",
    inputStructure: "detailed",
  })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) => {
    // The library does not enforce per-customer scoping here — the host is
    // expected to wrap this route with its own auth if it needs to restrict
    // which customer a caller may read.
    const getCustomerState = context.getCustomerState;

    if (getCustomerState === undefined) {
      // The aggregator was not wired into the context: the host did not compose
      // the cross-domain reader. Fail explicitly rather than returning a partial
      // shape the client would mistake for a full customer-state snapshot.
      throw new ORPCError("NOT_IMPLEMENTED", {
        status: 501,
        message: "Agregador de estado do cliente não configurado.",
      });
    }

    return unwrap(await getCustomerState(input.params.id));
  });

export const customersRouter = {
  create: createCustomer,
  get: getCustomer,
  getByExternalId: getCustomerByExternalId,
  list: listCustomers,
  state: getCustomerStateRoute,
  update: updateCustomer,
  updateByExternalId: updateCustomerByExternalId,
  delete: deleteCustomer,
};
