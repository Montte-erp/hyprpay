import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { Data, Effect, Exit, Schema } from "effect";
import type {
  Checkout,
  CheckoutInput,
  Customer,
  CustomerInput,
  HyprPayError,
  PortalSession,
  Subscription,
} from "@hyprpay/core";
import type { PlanDefinition, ProductDefinition } from "@hyprpay/core/catalog";
import type { PortalSessionInput } from "@hyprpay/core/portal";
import type { BillingEffect } from "@hyprpay/core/store";

export class HyprPayBetterAuthError extends Data.TaggedError("HyprPayBetterAuthError")<{
  readonly message: string;
}> {}

export interface BetterAuthSessionUser {
  readonly id: string;
  readonly email?: string | null;
  readonly name?: string | null;
}

export interface HyprPayBetterAuthRuntime {
  readonly catalog: readonly ProductDefinition[];
  readonly customers: {
    create(input: CustomerInput): BillingEffect<Customer>;
    findByExternalId(externalId: string): BillingEffect<Customer | null>;
  };
  readonly checkouts: {
    create(input: CheckoutInput): BillingEffect<Checkout>;
  };
  readonly subscriptions: {
    list(filter?: Partial<Subscription>): BillingEffect<readonly Subscription[]>;
  };
  readonly portal: {
    createSession(input: PortalSessionInput): BillingEffect<PortalSession>;
  };
}

export interface HyprPayBetterAuthOptions {
  readonly hyprpay: HyprPayBetterAuthRuntime;
}

const optionalUrlString = Schema.String.pipe(Schema.optionalKey);
const positiveAmount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const checkoutUpgradeInputSchema = Schema.Struct({
  planId: Schema.NonEmptyString,
  amount: positiveAmount.pipe(Schema.optionalKey),
  successUrl: optionalUrlString,
  cancelUrl: optionalUrlString,
});

const portalInputSchema = Schema.Struct({
  returnUrl: optionalUrlString,
});

const decodeCheckoutUpgradeInput = (input: unknown): Effect.Effect<Schema.Schema.Type<typeof checkoutUpgradeInputSchema>, HyprPayBetterAuthError> =>
  Schema.decodeUnknownEffect(checkoutUpgradeInputSchema)(input).pipe(
    Effect.mapError(() => new HyprPayBetterAuthError({ message: "Dados da assinatura inválidos." })),
  );

const decodePortalInput = (input: unknown): Effect.Effect<Schema.Schema.Type<typeof portalInputSchema>, HyprPayBetterAuthError> =>
  Schema.decodeUnknownEffect(portalInputSchema)(input).pipe(
    Effect.mapError(() => new HyprPayBetterAuthError({ message: "Dados do portal inválidos." })),
  );

const findPlan = (catalog: readonly ProductDefinition[], planId: string): PlanDefinition | null => {
  for (const product of catalog) {
    for (const plan of product.plans) {
      if (plan.id === planId) {
        return plan;
      }
    }
  }

  return null;
};

const planAmount = (catalog: readonly ProductDefinition[], planId: string): Effect.Effect<number, HyprPayBetterAuthError> => {
  const plan = findPlan(catalog, planId);

  if (plan?.price === undefined) {
    return Effect.fail(new HyprPayBetterAuthError({ message: "Plano sem preço configurado." }));
  }

  return Effect.succeed(plan.price.amountMinor);
};

const ensureCustomer = (
  hyprpay: HyprPayBetterAuthRuntime,
  user: BetterAuthSessionUser,
): Effect.Effect<Customer, HyprPayError | HyprPayBetterAuthError> =>
  Effect.gen(function* () {
    const existing = yield* hyprpay.customers.findByExternalId(user.id);

    if (existing !== null) {
      return existing;
    }

    return yield* hyprpay.customers.create({
      externalId: user.id,
      name: user.name ?? user.email ?? user.id,
      ...(user.email === undefined || user.email === null ? {} : { email: user.email }),
      metadata: {
        betterAuthUserId: user.id,
      },
    });
  });

interface EndpointSuccess<TValue extends Record<string, unknown>> {
  readonly body: {
    readonly ok: true;
    readonly data: TValue;
  };
  readonly init?: undefined;
}

interface EndpointFailure {
  readonly body: {
    readonly ok: false;
    readonly error: {
      readonly message: string;
    };
  };
  readonly init: {
    readonly status: 400;
  };
}

type EndpointResult<TValue extends Record<string, unknown>> = EndpointSuccess<TValue> | EndpointFailure;

const ok = <TValue extends Record<string, unknown>>(data: TValue): EndpointSuccess<TValue>["body"] => ({
  ok: true,
  data,
});

const fail = (message: string): EndpointFailure["body"] => ({
  ok: false,
  error: { message },
});

const runEndpoint = async <TValue extends Record<string, unknown>>(
  effect: Effect.Effect<TValue, HyprPayError | HyprPayBetterAuthError>,
  message: string,
): Promise<EndpointResult<TValue>> => {
  const result = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(result)) {
    return { body: ok(result.value) };
  }

  return {
    body: fail(message),
    init: { status: 400 },
  };
};

export const betterAuthHyprPay = (options: HyprPayBetterAuthOptions): BetterAuthPlugin => {
  const hyprpay = options.hyprpay;

  return {
    id: "hyprpay",
    endpoints: {
      hyprpaySyncCustomer: createAuthEndpoint("/hyprpay/customer/sync", {
        method: "POST",
        use: [sessionMiddleware],
      }, async ctx => {
        const result = await runEndpoint(
          Effect.map(ensureCustomer(hyprpay, ctx.context.session.user), customer => ({ customer })),
          "Falha ao sincronizar cliente.",
        );

        return ctx.json(result.body, result.init);
      }),
      hyprpaySubscriptionUpgrade: createAuthEndpoint("/hyprpay/subscription/upgrade", {
        method: "POST",
        use: [sessionMiddleware],
      }, async ctx => {
        const result = await runEndpoint(
          Effect.gen(function* () {
            const input = yield* decodeCheckoutUpgradeInput(ctx.body);
            const customer = yield* ensureCustomer(hyprpay, ctx.context.session.user);
            const amount = input.amount ?? (yield* planAmount(hyprpay.catalog, input.planId));
            const checkout = yield* hyprpay.checkouts.create({
              customerId: customer.id,
              planId: input.planId,
              amount,
              ...(input.successUrl === undefined ? {} : { successUrl: input.successUrl }),
              ...(input.cancelUrl === undefined ? {} : { cancelUrl: input.cancelUrl }),
              metadata: {
                betterAuthUserId: ctx.context.session.user.id,
              },
            });

            return { checkout };
          }),
          "Falha ao iniciar assinatura.",
        );

        return ctx.json(result.body, result.init);
      }),
      hyprpaySubscriptionList: createAuthEndpoint("/hyprpay/subscription/list", {
        method: "GET",
        use: [sessionMiddleware],
      }, async ctx => {
        const result = await runEndpoint(
          Effect.gen(function* () {
            const customer = yield* ensureCustomer(hyprpay, ctx.context.session.user);
            const subscriptions = yield* hyprpay.subscriptions.list({ customerId: customer.id });
            return { subscriptions };
          }),
          "Falha ao listar assinaturas.",
        );

        return ctx.json(result.body, result.init);
      }),
      hyprpayBillingPortal: createAuthEndpoint("/hyprpay/subscription/billing-portal", {
        method: "POST",
        use: [sessionMiddleware],
      }, async ctx => {
        const result = await runEndpoint(
          Effect.gen(function* () {
            const input = yield* decodePortalInput(ctx.body);
            const customer = yield* ensureCustomer(hyprpay, ctx.context.session.user);
            const session = yield* hyprpay.portal.createSession({
              customerId: customer.id,
              ...(input.returnUrl === undefined ? {} : { returnUrl: input.returnUrl }),
            });

            return { session };
          }),
          "Falha ao criar portal de billing.",
        );

        return ctx.json(result.body, result.init);
      }),
    },
    $ERROR_CODES: {
      HYPERPAY_BILLING_FAILED: {
        code: "HYPERPAY_BILLING_FAILED",
        message: "Falha ao executar billing.",
      },
    },
  };
};
