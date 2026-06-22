import { Effect } from "effect";

export type HyprPayTelemetryEventName =
  | "customer.created"
  | "checkout.created"
  | "subscription.created"
  | "webhook.committed"
  | "portal.session.created";

export interface HyprPayTelemetryEvent {
  readonly name: HyprPayTelemetryEventName;
  readonly properties?: Record<string, string | number | boolean>;
}

export interface HyprPayTelemetry {
  capture(event: HyprPayTelemetryEvent): Effect.Effect<void, never>;
}

export const noopHyprPayTelemetry: HyprPayTelemetry = {
  capture: () => Effect.void,
};
