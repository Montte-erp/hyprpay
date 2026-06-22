# HyprPay

Billing library TypeScript para produtos brasileiros/SaaS. A DX mira Polar/PayKit/Better Auth: catálogo em código, APIs pequenas, benefits locais e gateways substituíveis. O banco Postgres é a fonte da verdade; gateways só fazem cobrança, checkout, refund e webhook.

## Direção

- 100% Effect para runtime e falhas esperadas.
- 100% Effect Schema em boundaries.
- Core dividido por domínio (`core/benefits`, `core/entitlements`, `core/meters`, etc.); `core/index.ts` só compõe o runtime.
- Persistência primária em Postgres via Drizzle v1 RC e `@hyprpay/store-postgres`.
- Gateways finos em `gateways/*`: Asaas e Abacate Pay.
- CLI auxiliar em `core/cli` com Effect/CLI, inspirado no PayKit (`hyprpay push -y && next build`).
- Telemetria opt-in via evlog + PostHog, seguindo o modelo do Better Auth: env opt-in, opt-out explícito e ID anônimo hashado.

## Arquitetura de pastas

```text
core/                         # @hyprpay/core; runtime e domínios locais
  benefits/                   # grants, benefits e capabilities Polar-like
  checkouts/                  # hosted checkout local + provider ref
  customers/                  # customer API e vínculo externalId
  entitlements/               # checks e report de uso
  license-keys/               # keys e ativações
  meters/                     # metering local
  portal/                     # sessões de portal customer-owned
  seats/                      # assentos por benefit
  webhooks/                   # normalização e commit de eventos
  cli/                        # @hyprpay/cli; init/push/status
stores/postgres/              # @hyprpay/store-postgres; Drizzle v1 RC + Postgres
gateways/asaas/               # adapter Asaas
gateways/abacate-pay/         # adapter Abacate Pay
integrations/alchemy/         # provider config para Alchemy v2
integrations/better-auth/     # plugin server/client Better Auth
tooling/                      # build/config shared
```

## DX

```ts
import { Effect } from "effect";
import { benefit, createHyprPay, feature, plan, product } from "@hyprpay/core";
import { createAsaasProvider } from "@hyprpay/gateway-asaas";
import { postgresStore } from "@hyprpay/store-postgres";
import { hyprPayPostgresSchema } from "@hyprpay/store-postgres/schema";
import { drizzle } from "drizzle-orm/bun-sql";

const messages = feature.metered({ id: "messages", reset: "month" });

const pro = plan({
  id: "pro",
  group: "base",
  price: { amountMinor: 1990, currency: "BRL", interval: "month" },
  includes: [
    messages({ limit: 2_000 }),
    benefit.licenseKey({ id: "license", prefix: "HYP", limitActivations: 3 }),
    benefit.fileDownload({ id: "assets", fileId: "starter-kit", url: "https://cdn.example.com/starter-kit.zip" }),
    benefit.seats({ id: "team-seats", quantity: 5 }),
  ],
});

const app = product({ id: "app", name: "App", plans: [pro] });

const db = drizzle({
  connection: { url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/hyprpay" },
  schema: hyprPayPostgresSchema,
});

export const hyprpay = createHyprPay({
  catalog: [app],
  store: postgresStore({ db }),
  provider: createAsaasProvider({
    apiKey: process.env.ASAAS_API_KEY ?? "",
    server: "sandbox",
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN,
  }),
});

const customer = await Effect.runPromise(
  hyprpay.customers.create({
    externalId: "user_123",
    name: "Empresa XPTO",
    email: "financeiro@xpto.com.br",
    document: "12345678000199",
  }),
);

const checkout = await Effect.runPromise(
  hyprpay.checkouts.create({
    customerId: customer.id,
    planId: "pro",
    amount: 1990,
    methods: ["pix"],
    successUrl: "https://app.example.com/success",
    cancelUrl: "https://app.example.com/cancel",
  }),
);

await Effect.runPromise(
  hyprpay.webhooks.handle({
    processor: "manual",
    type: "checkout.paid",
    checkoutId: checkout.id,
  }),
);
```

## CLI

```bash
bunx hyprpay init
bunx hyprpay push -y
bunx hyprpay status --throw
```

Production usage:

```bash
bunx hyprpay push -y && next build
```

`hyprpay push -y` aplica migrações idempotentes do store Postgres e sincroniza versões imutáveis do catálogo, no estilo PayKit.

Telemetria da CLI é opt-in:

```bash
HYPERPAY_TELEMETRY=1 POSTHOG_API_KEY=phc_... bunx hyprpay status
```

Opt-out sempre vence: `HYPERPAY_TELEMETRY_DISABLED=1`, `HYPRPAY_TELEMETRY_DISABLED=1` ou `DO_NOT_TRACK=1`.

## Better Auth

```ts
import { betterAuth } from "better-auth";
import { betterAuthHyprPay } from "@hyprpay/better-auth";

export const auth = betterAuth({
  plugins: [betterAuthHyprPay({ hyprpay })],
});
```

Client:

```ts
import { createAuthClient } from "better-auth/client";
import { betterAuthHyprPayClient } from "@hyprpay/better-auth/client";

export const authClient = createAuthClient({
  plugins: [betterAuthHyprPayClient()],
});
```

A integração sincroniza o usuário Better Auth como `Customer.externalId`, inicia checkout para upgrade, lista subscriptions do banco HyprPay e cria portal sessions locais.

## Docs

```bash
bun run --cwd docs dev
bun run --cwd docs build
```

O site em Astro fica em `docs/` e documenta quickstart, CLI, Better Auth, entitlements e gateways com conteúdo original inspirado na clareza do PayKit.

## Scripts

```bash
bun install
bun run build
bun run typecheck
bun run test
bun run check
```
