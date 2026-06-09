// OpenAPIHandler ships from `@orpc/openapi/fetch` for the Web Request/Response
// runtime (matching HyprPay's core fetch handler). Switch to `@orpc/openapi/node`
// if a Node IncomingMessage adapter is needed instead.
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { createHyprPayOrpcRouter } from "./create-hyprpay-orpc-router";

/**
 * Builds an `OpenAPIHandler` over the composed billing router.
 *
 * The typed `hyprpay.api` is supplied as the request context at handle time,
 * e.g.:
 *
 *   const handler = createHyprPayOpenAPIHandler();
 *   const { matched, response } = await handler.handle(request, {
 *     prefix: "/api",
 *     context: { api: hyprpay.api },
 *   });
 *
 * Webhooks are NOT routed here — they stay raw (see index.ts).
 */
export const createHyprPayOpenAPIHandler = () => {
  const router = createHyprPayOrpcRouter();

  return new OpenAPIHandler(router);
};

export type HyprPayOpenAPIHandler = ReturnType<typeof createHyprPayOpenAPIHandler>;
