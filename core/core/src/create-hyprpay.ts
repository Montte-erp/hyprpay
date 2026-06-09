import type { HyprPayOptions } from "./hyprpay-options";
import { createHyprPayHandler } from "./hyprpay-handler";
import { assertPluginConfiguration, collectPluginApiExtensions, collectPluginRoutes, createHyprPayApi } from "./plugin-runtime";
import type { HyprPayPlugin, HyprPayPluginApiExtensions, HyprPayRuntime, HyprPayRuntimeEvent } from "./contracts/hyprpay-plugin";
import type { HyprPayRoute } from "./contracts/hyprpay-plugin";

export interface HyprPay<TPlugins extends readonly HyprPayPlugin[] | undefined = undefined> {
  api: HyprPayPluginApiExtensions<TPlugins>;
  handler(request: Request): Promise<Response>;
  emit(event: HyprPayRuntimeEvent): Promise<void>;
}

export const createHyprPay = <TPlugins extends readonly HyprPayPlugin[] | undefined>(
  options: HyprPayOptions<TPlugins>,
): HyprPay<TPlugins> => {
  const plugins = options.plugins ?? [];

  assertPluginConfiguration(plugins);

  const runtime: HyprPayRuntime = {
    emit: async event => {
      for (const plugin of plugins) {
        if (plugin.hooks?.onEvent !== undefined) {
          await plugin.hooks.onEvent(event, runtime);
        }
      }
    },
  };

  const api = createHyprPayApi<HyprPayPluginApiExtensions<TPlugins>>(
    collectPluginApiExtensions(plugins, runtime) as HyprPayPluginApiExtensions<TPlugins>,
  );

  const routes: HyprPayRoute[] = collectPluginRoutes(plugins);

  return {
    api,
    emit: runtime.emit,
    handler: createHyprPayHandler({
      plugins,
      routes,
      runtime,
    }),
  };
};

export type {
  HyprPayOptions,
  HyprPayPlugin,
  HyprPayPluginApiExtensions,
  HyprPayRoute,
  HyprPayRuntime,
  HyprPayRuntimeEvent,
};

export { createHyprPayHandler };
