import { Effect } from "effect";
import type { DrainContext } from "evlog";
import { createLogger, initLogger } from "evlog";
import { createDrainPipeline } from "evlog/pipeline";
import { createPostHogDrain } from "evlog/posthog";

export type HyprPayCliTelemetryStatus = "succeeded" | "failed";

export interface HyprPayCliTelemetryEvent {
  readonly command: string;
  readonly status: HyprPayCliTelemetryStatus;
  readonly properties?: Record<string, string | number | boolean>;
}

export type HyprPayCliTelemetryEnv = Record<string, string | undefined>;

const enabledByEnv = (env: HyprPayCliTelemetryEnv): boolean =>
  env.HYPERPAY_TELEMETRY === "1" || env.HYPRPAY_TELEMETRY === "1";

const hasPostHogKey = (env: HyprPayCliTelemetryEnv): boolean =>
  env.POSTHOG_API_KEY !== undefined && env.POSTHOG_API_KEY.length > 0;

const anonymousId = async (seed: string): Promise<string> => {
  const data = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
};

export const isHyprPayCliTelemetryDisabled = (env: HyprPayCliTelemetryEnv): boolean =>
  env.HYPERPAY_TELEMETRY_DISABLED === "1" ||
  env.HYPRPAY_TELEMETRY_DISABLED === "1" ||
  env.DO_NOT_TRACK === "1" ||
  !enabledByEnv(env) ||
  !hasPostHogKey(env);

export const captureHyprPayCliTelemetry = (
  event: HyprPayCliTelemetryEvent,
  env: HyprPayCliTelemetryEnv = process.env,
): Effect.Effect<void, never> => {
  if (isHyprPayCliTelemetryDisabled(env)) {
    return Effect.void;
  }

  return Effect.tryPromise({
    try: async () => {
      const id = await anonymousId(process.cwd());
      const drain = createDrainPipeline<DrainContext>({
        batch: {
          size: 1,
          intervalMs: 1_000,
        },
        retry: {
          maxAttempts: 2,
          backoff: "exponential",
          initialDelayMs: 250,
        },
      })(createPostHogDrain({
        mode: "events",
        eventName: "hyprpay_cli",
        distinctId: id,
      }));

      initLogger({
        env: {
          service: "hyprpay-cli",
          environment: env.NODE_ENV ?? "development",
        },
        drain,
        pretty: false,
      });

      const log = createLogger({
        operation: "hyprpay_cli",
        command: event.command,
      });
      log.set({
        anonymousId: id,
        telemetry: {
          enabledBy: "env",
          status: event.status,
          properties: event.properties ?? {},
        },
      });
      log.emit();
      await drain.flush();
    },
    catch: () => undefined,
  }).pipe(Effect.catch(() => Effect.void));
};
