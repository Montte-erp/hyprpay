export interface HyprPayRuntimeEvent<TType extends string = string, TPayload = unknown> {
  type: TType;
  payload: TPayload;
}

export interface HyprPayRuntime {
  emit(event: HyprPayRuntimeEvent): Promise<void>;
}

export interface HyprPayRoute {
  method: string;
  path: string;
  handler(request: Request, runtime: HyprPayRuntime): Promise<Response>;
}

export interface HyprPayPluginHooks {
  onEvent?(event: HyprPayRuntimeEvent, runtime: HyprPayRuntime): Promise<void>;
  onRequest?(request: Request, runtime: HyprPayRuntime): Promise<Request | Response | void>;
  onResponse?(response: Response, runtime: HyprPayRuntime): Promise<Response | void>;
}

export interface HyprPayPlugin<
  TNamespace extends string = string,
  TApi extends object = Record<string, never>,
> {
  id: string;
  namespace: TNamespace;
  extendApi?(runtime: HyprPayRuntime): TApi;
  routes?: HyprPayRoute[];
  hooks?: HyprPayPluginHooks;
}

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer TResult) => void
  ? TResult
  : never;

type PluginNamespaceRecord<TPlugin extends HyprPayPlugin> = TPlugin extends HyprPayPlugin<
  infer TNamespace,
  infer TApi
>
  ? { [K in TNamespace]: TApi }
  : never;

export type HyprPayPluginApiExtensions<TPlugins extends readonly HyprPayPlugin[] | undefined> =
  TPlugins extends readonly HyprPayPlugin[]
    ? Simplify<UnionToIntersection<PluginNamespaceRecord<TPlugins[number]>>>
    : Record<string, never>;
