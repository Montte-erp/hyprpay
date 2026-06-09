import type { HyprPayPlugin } from "./contracts/hyprpay-plugin";

export interface HyprPayOptions<TPlugins extends readonly HyprPayPlugin[] | undefined = readonly HyprPayPlugin[] | undefined> {
  plugins?: TPlugins;
}
