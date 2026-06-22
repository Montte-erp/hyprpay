import { Effect } from "effect";
import type { CreateHyprPayOptions } from "../plugin";
import type { HyprPayTelemetryEventName } from "../telemetry";

export const captureTelemetry = (
  options: CreateHyprPayOptions,
  name: HyprPayTelemetryEventName,
  properties?: Record<string, string | number | boolean>,
): Effect.Effect<void, never> => options.telemetry?.capture({
  name,
  ...(properties === undefined ? {} : { properties }),
}) ?? Effect.void;
