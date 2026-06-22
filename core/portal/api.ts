import { Effect } from "effect";
import { notFound } from "../errors";
import { defineHyprPayPlugin, type CreateHyprPayOptions } from "../plugin";
import { decodePortalSessionInput, type PortalSessionInput } from "../portal/schema";
import { createPortalSessionRecord } from "../internal/records";
import { captureTelemetry } from "../internal/telemetry";
import type { PortalSession } from "../schemas";
import type { BillingEffect } from "../store";

export const createPortalApi = (options: CreateHyprPayOptions) => ({
  createSession: (input: PortalSessionInput): BillingEffect<PortalSession> => Effect.gen(function* () {
    const parsed = yield* decodePortalSessionInput(input);
    const customer = yield* options.store.customers.findById(parsed.customerId);

    if (customer === null) {
      return yield* Effect.fail(notFound());
    }

    const session = yield* options.store.portalSessions.create(createPortalSessionRecord(parsed, options));
    yield* captureTelemetry(options, "portal.session.created", {
      hasReturnUrl: session.returnUrl !== undefined,
    });
    return session;
  }),
});

export const portalPlugin = defineHyprPayPlugin({
  id: "portal",
  build: createPortalApi,
});
