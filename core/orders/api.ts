import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import type { Order } from "../schemas";
import type { BillingEffect } from "../store";

export const createOrdersApi = (options: CreateHyprPayOptions) => ({
  get: (orderId: string): BillingEffect<Order | null> => options.store.orders.findById(orderId),
  list: (filter?: Partial<Order>): BillingEffect<readonly Order[]> => options.store.orders.list(filter),
});

export const ordersPlugin = defineHyprPayPlugin({
  id: "orders",
  build: createOrdersApi,
});
