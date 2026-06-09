import type { HyprPayPlugin, HyprPayRoute, HyprPayRuntime } from "./contracts/hyprpay-plugin";

const pluginIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pluginNamespacePattern = /^[a-z][a-zA-Z0-9]*$/;
const routeKey = (route: HyprPayRoute) => `${route.method.toUpperCase()}:${route.path}`;

const assertPluginId = (plugin: HyprPayPlugin) => {
  if (!pluginIdPattern.test(plugin.id)) {
    throw new Error(`Invalid HyprPay plugin id: ${plugin.id}. Use kebab-case.`);
  }
};

const assertPluginNamespace = (plugin: HyprPayPlugin) => {
  if (!pluginNamespacePattern.test(plugin.namespace)) {
    throw new Error(
      `Invalid HyprPay plugin namespace: ${plugin.namespace}. Use camelCase alphanumeric names.`,
    );
  }
};

export const assertPluginConfiguration = (plugins: readonly HyprPayPlugin[]) => {
  const seenIds = new Set<string>();
  const seenNamespaces = new Set<string>();
  const seenRoutes = new Map<string, string>();

  for (const plugin of plugins) {
    assertPluginId(plugin);
    assertPluginNamespace(plugin);

    if (seenIds.has(plugin.id)) {
      throw new Error(`Duplicate HyprPay plugin id: ${plugin.id}.`);
    }

    if (seenNamespaces.has(plugin.namespace)) {
      throw new Error(`Duplicate HyprPay plugin namespace: ${plugin.namespace}.`);
    }

    seenIds.add(plugin.id);
    seenNamespaces.add(plugin.namespace);

    for (const route of plugin.routes ?? []) {
      const key = routeKey(route);
      const owner = seenRoutes.get(key);

      if (owner !== undefined) {
        throw new Error(
          `Duplicate HyprPay route registration: ${route.method} ${route.path} is already owned by ${owner}.`,
        );
      }

      seenRoutes.set(key, plugin.id);
    }
  }
};

export const collectPluginApiExtensions = (
  plugins: readonly HyprPayPlugin[],
  runtime: HyprPayRuntime,
): Record<string, unknown> => {
  const apiExtensions: Record<string, unknown> = {};

  for (const plugin of plugins) {
    if (plugin.extendApi === undefined) {
      continue;
    }

    const extension = plugin.extendApi(runtime);

    if (typeof extension !== "object" || extension === null || Array.isArray(extension)) {
      throw new Error(`HyprPay plugin ${plugin.id} must return an object from extendApi().`);
    }

    apiExtensions[plugin.namespace] = extension;
  }

  return apiExtensions;
};

export const collectPluginRoutes = (plugins: readonly HyprPayPlugin[]) =>
  plugins.flatMap(plugin => plugin.routes ?? []);

export const createHyprPayApi = <TApi extends Record<string, unknown>>(
  pluginApiExtensions: TApi,
) => pluginApiExtensions;
