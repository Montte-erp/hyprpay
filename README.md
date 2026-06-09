# HyprPay

Monorepo TypeScript para billing brasileiro com runtime plugin-first.

## Workspaces atuais

- `@hyprpay/core` — host de plugins, composição de API e handler HTTP.
- `@hyprpay/catalog` — produtos e preços.
- `@hyprpay/customers` — clientes.
- `@hyprpay/checkouts` — checkout.
- `@hyprpay/charges` — cobranças avulsas.
- `@hyprpay/subscriptions` — assinaturas e uso.
- `@hyprpay/webhooks` — ingestão e normalização de webhooks.
- `@hyprpay/entitlements` — entitlements, benefits e license keys.
- `@hyprpay/discounts` — cupons e descontos.
- `@hyprpay/orders` — centro financeiro (orders + invoices).
- `@hyprpay/refunds` — reembolsos (depende de orders).
- `@hyprpay/meters` — usage/meters/credits.
- `@hyprpay/seats` — billing por assento (invite/claim/charge).
- `@hyprpay/drizzle` — adapters ORM para os plugins e schemas Drizzle.
- `@hyprpay/orpc` — transporte oRPC/OpenAPI sobre `hyprpay.api` (com auth por token).
- `@hyprpay/abacatepay` — gateway inicial, exposto por facetas compatíveis com os plugins.

```ts
import { createHyprPay } from "@hyprpay/core";
import { catalog } from "@hyprpay/catalog";
import { customers } from "@hyprpay/customers";
import { checkouts } from "@hyprpay/checkouts";
import { charges } from "@hyprpay/charges";
import { subscriptions } from "@hyprpay/subscriptions";
import { webhooks } from "@hyprpay/webhooks";
import { entitlements } from "@hyprpay/entitlements";
import { createDrizzleAdapters, createDrizzleEntitlementsStore } from "@hyprpay/drizzle";
import { createAbacatePayGateway } from "@hyprpay/abacatepay";

const drizzle = createDrizzleAdapters(db);
const gateway = createAbacatePayGateway({
  apiKey: process.env.ABACATEPAY_API_KEY ?? "",
  environment: "sandbox",
  webhookSecret: process.env.ABACATEPAY_WEBHOOK_SECRET,
});

const hyprpay = createHyprPay({
  plugins: [
    catalog({ database: drizzle.catalog, provider: gateway.catalog }),
    customers({ database: drizzle.customers, provider: gateway.customers }),
    checkouts({ database: drizzle.checkouts, catalog: drizzle.catalog, provider: gateway.checkouts }),
    charges({ database: drizzle.charges, provider: gateway.charges }),
    subscriptions({ database: drizzle.subscriptions, catalog: drizzle.catalog, provider: gateway.subscriptions }),
    webhooks({
      database: drizzle.webhooks,
      charges: drizzle.charges,
      checkouts: drizzle.checkouts,
      subscriptions: drizzle.subscriptions,
      provider: gateway.webhooks,
      webhookPath: "/billing/webhooks",
    }),
    entitlements({
      store: createDrizzleEntitlementsStore(db),
    }),
  ],
});

const product = await hyprpay.api.catalog.products.create({
  slug: "pro",
  name: "Plano Pro",
});

await hyprpay.api.customers.create({
  name: "Empresa XPTO",
  email: "financeiro@xpto.com.br",
  document: "12345678000199",
});

await hyprpay.api.entitlements.grant({
  customerId: "cust_123",
  feature: "reports.export",
  limit: 10,
});
```

## Transporte oRPC + OpenAPI

O pacote `@hyprpay/orpc` expõe `hyprpay.api` por HTTP. Rotas que mutam exigem um
bearer token (`authedProcedure`); leituras públicas usam `billingProcedure`; o
agregador de estado do cliente (`customers.state`) usa `authedProcedure` com
escopo por cliente. Webhooks continuam fora do oRPC (raw, verificados por
assinatura).

```ts
import {
  createHyprPayOrpcRouter,
  createHyprPayOpenAPIHandler,
  type HyprPayVerifyToken,
} from "@hyprpay/orpc";
import {
  createGetCustomerState,
  createCustomerStateWatcher,
} from "@hyprpay/customers";

// Verificador de token fornecido pelo host (default-deny quando ausente).
const verifyToken: HyprPayVerifyToken = (token) =>
  token === process.env.HYPRPAY_SECRET
    ? { kind: "organization", subject: "org_root" }
    : null;

// Agregador read-only: cliente + assinaturas ativas + entitlements + saldos de
// meter + orders recentes. Emite `billing.customer.state_changed` quando muda.
const getCustomerState = createCustomerStateWatcher(
  { emit: hyprpay.emit },
  createGetCustomerState({
    customers: hyprpay.api.customers,
    subscriptions: hyprpay.api.subscriptions,
    orders: hyprpay.api.orders,
    // entitlements/meters são opcionais: ports indexados por cliente que o host
    // fornece (a fonte por-feature/por-meter não enumera por cliente).
  }),
);

const handler = createHyprPayOpenAPIHandler();

// Por requisição, passe a api + auth + agregador como contexto do oRPC.
const { response } = await handler.handle(request, {
  prefix: "/api",
  context: { api: hyprpay.api, headers: request.headers, verifyToken, getCustomerState },
});

// GET /api/billing/customers/{idOrExternalId}/state  ->  customers.state
```

`createHyprPayOrpcRouter()` compõe todos os routers: `catalog`, `customers`,
`checkouts`, `subscriptions`, `orders`, `refunds`, `meters`, `discounts`,
`entitlements`, `seats`.

## Scripts

```bash
bun install
bun run typecheck
bun run build
bun test
```
