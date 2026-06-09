import type { HyprPayPlugin, HyprPayRoute, HyprPayRuntime } from "./contracts/hyprpay-plugin";

export interface HyprPayHandlerOptions {
  plugins?: readonly HyprPayPlugin[];
  routes: readonly HyprPayRoute[];
  runtime: HyprPayRuntime;
}

const notFoundResponse = () =>
  Response.json(
    {
      success: false,
      error: "Rota HyprPay não encontrada.",
    },
    { status: 404 },
  );

const findRoute = (routes: readonly HyprPayRoute[], request: Request) => {
  const url = new URL(request.url);
  return routes.find(route => route.method.toUpperCase() === request.method.toUpperCase() && route.path === url.pathname);
};

const applyResponseHooks = async (
  plugins: readonly HyprPayPlugin[],
  runtime: HyprPayRuntime,
  response: Response,
) => {
  let nextResponse = response;

  for (const plugin of plugins) {
    if (plugin.hooks?.onResponse === undefined) {
      continue;
    }

    const maybeResponse = await plugin.hooks.onResponse(nextResponse, runtime);

    if (maybeResponse instanceof Response) {
      nextResponse = maybeResponse;
    }
  }

  return nextResponse;
};

export const createHyprPayHandler = (options: HyprPayHandlerOptions) => {
  const plugins = options.plugins ?? [];

  return async (request: Request) => {
    let nextRequest = request;

    for (const plugin of plugins) {
      if (plugin.hooks?.onRequest === undefined) {
        continue;
      }

      const requestResult = await plugin.hooks.onRequest(nextRequest, options.runtime);

      if (requestResult instanceof Response) {
        return applyResponseHooks(plugins, options.runtime, requestResult);
      }

      if (requestResult instanceof Request) {
        nextRequest = requestResult;
      }
    }

    const route = findRoute(options.routes, nextRequest);

    if (route === undefined) {
      return applyResponseHooks(plugins, options.runtime, notFoundResponse());
    }

    const response = await route.handler(nextRequest, options.runtime);

    return applyResponseHooks(plugins, options.runtime, response);
  };
};
