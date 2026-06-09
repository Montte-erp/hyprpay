import { z } from "zod";
import {
  invoiceInputSchema,
  orderBillingUpdateInputSchema,
  orderInputSchema,
} from "@hyprpay/orders";
import { unwrap } from "../error/billing-result-to-orpc-error";
import { billingProcedure } from "../procedure";

const createOrder = billingProcedure
  .route({ method: "POST", path: "/billing/orders" })
  .input(orderInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.orders.create(input)));

const getOrder = billingProcedure
  .route({ method: "GET", path: "/billing/orders/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) => unwrap(await context.api.orders.get(input.params.id)));

const listOrders = billingProcedure
  .route({ method: "GET", path: "/billing/orders", inputStructure: "detailed" })
  .input(
    z.object({
      query: z.object({
        customerId: z.string().min(1).optional(),
        subscriptionId: z.string().min(1).optional(),
      }),
    }),
  )
  .handler(async ({ context, input }) => {
    // exactOptionalPropertyTypes: build the filter without assigning explicit undefined.
    const filter: { customerId?: string; subscriptionId?: string } = {
      ...(input.query.customerId !== undefined ? { customerId: input.query.customerId } : {}),
      ...(input.query.subscriptionId !== undefined
        ? { subscriptionId: input.query.subscriptionId }
        : {}),
    };

    return unwrap(await context.api.orders.list(filter));
  });

const updateOrderBilling = billingProcedure
  .route({ method: "PATCH", path: "/billing/orders/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
      body: orderBillingUpdateInputSchema,
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.orders.update({
        orderId: input.params.id,
        billing: input.body,
      }),
    ),
  );

const markOrderPaid = billingProcedure
  .route({ method: "POST", path: "/billing/orders/{id}/paid", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) => unwrap(await context.api.orders.markPaid(input.params.id)));

const recordOrderRefund = billingProcedure
  .route({ method: "POST", path: "/billing/orders/{id}/refunds", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
      body: z.object({ amount: z.number().int().positive() }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(
      await context.api.orders.recordRefund({
        orderId: input.params.id,
        amount: input.body.amount,
      }),
    ),
  );

const draftInvoice = billingProcedure
  .route({ method: "POST", path: "/billing/invoices" })
  .input(invoiceInputSchema)
  .handler(async ({ context, input }) => unwrap(await context.api.orders.draftInvoice(input)));

const issueInvoice = billingProcedure
  .route({ method: "POST", path: "/billing/invoices/{id}/issue", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.orders.issueInvoice(input.params.id)),
  );

const getInvoice = billingProcedure
  .route({ method: "GET", path: "/billing/invoices/{id}", inputStructure: "detailed" })
  .input(
    z.object({
      params: z.object({ id: z.string().min(1) }),
    }),
  )
  .handler(async ({ context, input }) =>
    unwrap(await context.api.orders.getInvoice(input.params.id)),
  );

const listInvoices = billingProcedure
  .route({ method: "GET", path: "/billing/invoices", inputStructure: "detailed" })
  .input(
    z.object({
      query: z.object({
        orderId: z.string().min(1).optional(),
        customerId: z.string().min(1).optional(),
      }),
    }),
  )
  .handler(async ({ context, input }) => {
    // exactOptionalPropertyTypes: build the filter without assigning explicit undefined.
    const filter: { orderId?: string; customerId?: string } = {
      ...(input.query.orderId !== undefined ? { orderId: input.query.orderId } : {}),
      ...(input.query.customerId !== undefined ? { customerId: input.query.customerId } : {}),
    };

    return unwrap(await context.api.orders.listInvoices(filter));
  });

export const ordersRouter = {
  create: createOrder,
  get: getOrder,
  list: listOrders,
  update: updateOrderBilling,
  markPaid: markOrderPaid,
  recordRefund: recordOrderRefund,
  draftInvoice,
  issueInvoice,
  getInvoice,
  listInvoices,
};
