# HyprPay — rearchitecture do billing core

Data: 2026-06-08
Status: proposta arquitetural baseada em pesquisa do repo atual + docs oficiais de Polar, oRPC, Better Auth, Drizzle e Dinero.js.

## Objetivo

Desenhar a próxima arquitetura do HyprPay com estas decisões já fixadas:

- inspiração forte nas strategies de billing da Polar
- endpoints baseados em oRPC
- Drizzle movido para `orms/`
- pasta top-level `adapters/` removida como workspace público
- `integrations/` para Better Auth e integrações de borda
- `shared/` para fundações compartilhadas, incluindo `ky` e helpers de dinheiro
- BRL only por enquanto
- sem SDKs próprios
- sem OAuth
- sem Merchant of Record
- sem multi-currency por enquanto

---

## Resumo executivo

### O que eu manteria

- o core plugin-first e frameworkless
- os bounded contexts separados em `plugins/*`
- `better-result` + `evlog`
- gateway/provider packages separados por PSP
- BRL-only e centavos inteiros no domínio

### O que eu mudaria imediatamente

1. `adapters/drizzle` → `orms/drizzle`
2. criar `transports/orpc` para a superfície HTTP pública
3. criar `integrations/better-auth` para sync auth ↔ billing
4. criar `shared/http` com `ky`
5. criar `shared/money` com Dinero.js
6. reduzir `gateways/abacatepay` para um provider fino por capability, sem `operations/` + `mappers/` espalhados por todo o pacote
7. parar de usar schemas de domínio como schemas de persistência
8. introduzir `orders` e `refunds` como recursos de primeira classe

### O que eu **não** colocaria no core agora

- SDK próprio
- OAuth
- MoR
- multi-currency
- portal completo estilo Polar
- abstração multi-ORM prematura

---

## Estado atual do repo

## Estrutura observada

Workspaces atuais em `package.json`:

- `core/*`
- `plugins/*`
- `adapters/*`
- `gateways/*`
- `erp/*`
- `integrations/*`
- `fiscal/*`

Estrutura materializada hoje:

- `core/core`
- `plugins/catalog`
- `plugins/customers`
- `plugins/checkouts`
- `plugins/charges`
- `plugins/subscriptions`
- `plugins/webhooks`
- `plugins/entitlements`
- `adapters/drizzle`
- `gateways/abacatepay`

Arquivos-chave:

- runtime: `core/core/src/create-hyprpay.ts`, `core/core/src/hyprpay-handler.ts`, `core/core/src/plugin-runtime.ts`
- domínio: `plugins/*/src/*`
- persistência atual: `adapters/drizzle/src/index.ts`, `adapters/drizzle/src/billing/drizzle-adapter.ts`
- provider atual: `gateways/abacatepay/src/create-abacate-pay-adapter.ts`

## Capacidades atuais

Hoje o HyprPay expõe basicamente:

- `catalog.products.create`
- `catalog.prices.create`
- `customers.create`
- `checkouts.create`
- `charges.create`
- `subscriptions.create`
- `subscriptions.cancel`
- `subscriptions.recordUsage`
- `webhooks.handle`
- `entitlements.grant/check/consume`

Isso é um core transacional mínimo. Ainda não é um billing core no nível de modelagem de produto da Polar.

---

## Problemas arquiteturais atuais

## 1. `adapters/drizzle` está no lugar errado conceitualmente

Hoje `adapters/drizzle` é um workspace público, mas ele não é um "adapter genérico"; ele é o ORM package oficial do projeto.

Exemplos:

- `adapters/drizzle/src/index.ts`
- `adapters/drizzle/src/billing/drizzle-adapter.ts`
- `adapters/drizzle/src/entitlements/drizzle-entitlements-store.ts`

Decisão proposta:

- mover para `orms/drizzle`
- deixar `adapters` como conceito **interno** de implementação, não como pasta top-level pública

## 2. Os schemas de persistência estão errados

Hoje os arquivos em `adapters/drizzle/src/billing/zod/*` não derivam do Drizzle. Eles só reexportam schemas de domínio.

Exemplo explícito:

`adapters/drizzle/src/billing/zod/customer-schemas.ts`

```ts
import { customerSchema } from "../../billing-plugin"

export const billingCustomerInsertSchema = customerSchema;
export const billingCustomerSelectSchema = customerSchema;
export const billingCustomerUpdateSchema = customerSchema;
```

Isso mistura duas coisas que precisam ser diferentes:

- schema do **domínio público**
- schema do **row shape** do banco

### Decisão proposta

Você pediu `drizzle-zod`. A decisão correta hoje é usar **`drizzle-orm/zod`**, não o pacote standalone antigo.

Motivo:

- a própria doc do Drizzle marca `drizzle-zod` standalone como deprecated
- a geração first-class agora está em `drizzle-orm/zod`

Fonte oficial:

- https://orm.drizzle.team/docs/zod

### Regra nova

- tudo que representa **insert/select/update do banco** vem de `drizzle-orm/zod`
- tudo que representa **contrato público de API/domínio** continua sendo schema de domínio explícito
- quando fizer sentido, o schema de domínio pode ser composto/refinado a partir do gerado pelo Drizzle
- o que **não** pode acontecer é usar schema de tabela cru como contrato HTTP público sem adaptação

## 3. `gateways/abacatepay` está bloatado

Sinais concretos:

- `create-abacate-pay-adapter.ts` junta 6 facetas de provider numa factory só
- `operations/*` e `mappers/*` fragmentam demais a lógica
- `invalidConfigGateway` duplica stubs de erro por método
- `dayjs` está nas deps do package e não aparece em `src`
- `environment` existe no schema mas o cliente usa base URL fixa
- `webhookSecret` participa de query string check, não da assinatura criptográfica principal

Arquivos:

- `gateways/abacatepay/src/create-abacate-pay-adapter.ts`
- `gateways/abacatepay/src/abacatepay-client.ts`
- `gateways/abacatepay/src/abacatepay-env.ts`
- `gateways/abacatepay/src/operations/verify-webhook.ts`

Exemplo de inconsistência real:

- `abacatepay-env.ts` define `environment: "sandbox" | "production"`
- `abacatepay-client.ts` usa `const baseUrl = "https://api.abacatepay.com/v2"`

Ou seja: o contrato promete uma configuração que a implementação não honra.

## 4. `charges` ainda é muito low-level para ser a entidade principal de dinheiro

A Polar trata dinheiro com `orders` e `refunds` como entidades de primeira classe.

O HyprPay hoje expõe `charges.create`, mas não tem:

- `orders`
- `refunds`
- `billing_reason`
- trilha financeira completa de renewals / reversões

Para um sistema que lida com dinheiro, isso é insuficiente.

## 5. O handler HTTP atual é mínimo demais para virar a API principal

`core/core/src/hyprpay-handler.ts` hoje faz matching exato por método+path. Isso basta para webhook. Não basta para uma surface pública de billing.

Faltam hoje:

- validação HTTP por route
- params/query/body modelados
- errors HTTP tipados
- OpenAPI
- typed client generation path
- integração natural com mutations/queries

---

## O que aproveitar da Polar

## Estratégias de billing observadas

Docs oficiais usadas:

- produtos: https://polar.sh/docs/features/products
- subscriptions manage: https://polar.sh/docs/features/subscriptions/manage
- proration: https://polar.sh/docs/features/subscriptions/proration
- usage billing: https://polar.sh/docs/features/usage-based-billing/introduction
- meters: https://polar.sh/docs/features/usage-based-billing/meters
- seats: https://polar.sh/docs/features/seat-based-pricing
- discounts: https://polar.sh/docs/features/discounts
- orders: https://polar.sh/docs/features/orders
- refunds: https://polar.sh/docs/features/refunds
- benefits: https://polar.sh/docs/features/benefits/introduction

## Estratégia 1 — one-time purchase

Como a Polar pensa:

- produto avulso
- checkout gera order
- pagamento concluído gera acesso/benefício
- refund é separado da order

Primitivos que HyprPay precisa:

- `product`
- `price`
- `checkout`
- `order`
- `payment/charge` interno
- `refund`
- `benefit grant`

## Estratégia 2 — recurring subscription

Como a Polar pensa:

- assinatura é relacionamento recorrente
- cada ciclo gera order
- cancel at period end ≠ revoke now
- trial, renewal, failed payment, past_due e uncancel são parte do modelo

Primitivos que HyprPay precisa:

- `subscription`
- `subscription_status`
- `current_period_start/end`
- `cancel_at_period_end`
- `ended_at`
- `trial_end`
- `order` por ciclo
- política de proration

## Estratégia 3 — recurring + trial

Como a Polar pensa:

- trial é parte do preço/produto e do lifecycle da assinatura
- trial pode ser criado, estendido ou encerrado

Primitivos que HyprPay precisa:

- `trial_days` no catálogo
- `trial_end` na assinatura
- eventos explícitos de início/fim de trial

## Estratégia 4 — metered billing

Como a Polar pensa:

- usage billing = events → meters → metered prices
- `recordUsage` isolado não basta
- é preciso definir o que conta, como agrega e quando fecha a conta

Primitivos que HyprPay precisa:

- `meter`
- `meter_event`
- `meter_aggregation`
- `subscription_usage_snapshot`
- `usage_charge_line`
- eventual `credits`

## Estratégia 5 — hybrid base + usage

Como a Polar pensa:

- assinatura pode combinar fee base + overage
- metered prices podem coexistir com o preço fixo

Primitivos que HyprPay precisa:

- price components
- order lines separadas
- fechamento por ciclo

## Estratégia 6 — seat-based billing

Como a Polar pensa:

- seats são uma estratégia específica, não um hack em metadata
- seat count afeta billing
- assign/revoke são entidades reais

Primitivos que HyprPay precisa:

- `seat_plan`
- `subscription_quantity`
- `member`
- `seat_assignment`
- proration de quantity

## Estratégia 7 — discounts

Como a Polar pensa:

- desconto é recurso próprio
- percentual/fixo
- duração
- restrições

Primitivos que HyprPay precisa:

- `discount`
- `discount_application`
- cálculo financeiro sobre order/subscription

## Estratégia 8 — orders e refunds como ledger de negócio

Como a Polar pensa:

- order é a unidade financeira
- refund é recurso separado, vinculado à order

Primitivos que HyprPay precisa:

- `order`
- `order_line`
- `refund`
- `refund_line` ou pelo menos `refund.amount`
- `billing_reason`

## Estratégia 9 — benefits / entitlements

Como a Polar pensa:

- benefits são concedidos/revogados automaticamente pelo estado de compra/assinatura

Primitivos que HyprPay precisa:

- manter `entitlements`, mas evoluir para engine de grants por evento financeiro
- separar entitlement manual de entitlement concedido por billing

---

## Estratégias que eu implementaria no HyprPay

## Fase obrigatória de core

Estas entram no core de verdade:

1. `one_time`
2. `recurring`
3. `recurring_with_trial`
4. `discounted`
5. `refund`
6. `order_based_billing`

## Fase seguinte

7. `metered`
8. `hybrid_base_plus_usage`
9. `seat_based`

## Como modelar isso no catálogo

Em vez de `usageBased: boolean`, o catálogo deve passar a modelar uma estratégia explícita.

Exemplo conceitual:

```ts
billingStrategy:
  | "one_time"
  | "subscription"
  | "subscription_with_trial"
  | "metered"
  | "hybrid"
  | "seat"
```

`usageBased: boolean` é fraco demais. Strategy explícita reduz branch implícito e deixa o domínio legível.

---

## Estrutura proposta de workspaces

## Estrutura top-level recomendada

```text
core/
  core/                     # @hyprpay/core

plugins/
  catalog/
  customers/
  checkouts/
  subscriptions/
  orders/
  refunds/
  discounts/
  entitlements/
  meters/
  webhooks/
  seats/                    # quando entrar

orms/
  drizzle/                  # @hyprpay/drizzle

transports/
  orpc/                     # @hyprpay/orpc

integrations/
  better-auth/              # @hyprpay/better-auth

gateways/
  abacatepay/

shared/
  http/                     # ky + helpers HTTP
  money/                    # dinero helpers BRL
```

## O que some

```text
adapters/
```

Como workspace público, sim.

## O que continua existindo

O conceito de adapter continua existindo **internamente**:

- provider adapter
- orm adapter
- integration adapter
- mapper adapter se necessário

Mas isso vira detalhe interno de cada package.

---

## Responsabilidade por workspace

## `@hyprpay/core`

Responsabilidade:

- runtime plugin-first
- composition root
- event bus interno
- contracts base
- nenhum acoplamento com oRPC, Better Auth, Drizzle ou ky

Não deve conter:

- tabelas Drizzle
- routers oRPC
- hooks Better Auth
- cliente HTTP de PSP

## `plugins/*`

Responsabilidade:

- domínio e API interna por bounded context
- schemas de domínio
- invariantes
- operações de negócio
- contratos contra provider/persistência

Recomendação importante:

- `orders`, `refunds`, `discounts` e `meters` precisam virar plugins próprios
- `charges` pode deixar de ser API principal e virar detalhe de pagamento/provider

## `orms/drizzle`

Responsabilidade:

- schema SQL
- tabelas
- migrations
- `drizzle-orm/zod`
- implementação dos contratos de persistência dos plugins

Regra:

- este package sabe de Drizzle
- o resto do sistema não sabe de Drizzle

## `transports/orpc`

Responsabilidade:

- publicar a surface HTTP do HyprPay em oRPC/OpenAPI
- mapear `hyprpay.api.*` para procedures
- traduzir `BillingResult` → `ORPCError`
- expor handler/router tipado

Regra:

- oRPC fica fora do core
- endpoint surface baseada em oRPC, domínio não

## `integrations/better-auth`

Responsabilidade:

- sync auth user ↔ billing customer
- hooks Better Auth
- tabela de vínculo auth/billing
- regras de idempotência

Regra:

- Better Auth é integração opcional de borda
- não entra no core

## `shared/http`

Responsabilidade:

- padrão HTTP baseado em `ky`
- helpers de request/response
- timeout/retry/user-agent default
- parse + validação de JSON
- normalização de erro

## `shared/money`

Responsabilidade:

- helpers BRL usando Dinero.js
- cálculo de desconto
- cálculo de proration
- cálculo de rate/tax
- allocation
- trim/round

---

## Endpoint strategy com oRPC

## Veredito

Sim, é totalmente possível basear a estrutura de endpoints em oRPC.

Docs oficiais usadas:

- procedures: https://orpc.dev/docs/procedure
- router: https://orpc.dev/docs/router
- OpenAPI routing: https://orpc.dev/docs/openapi/routing
- input/output structure: https://orpc.dev/docs/openapi/input-output-structure
- TanStack Query: https://orpc.dev/docs/integrations/tanstack-query

## O que o oRPC resolve bem aqui

- procedures tipadas
- input/output com Zod
- routers aninháveis
- OpenAPI handler
- compatibilidade natural com query/mutation no cliente TanStack
- contexto e middleware
- fetch/http adapters sem framework obrigatório

## Decisão recomendada

### Não

- não acoplar `@orpc/server` dentro de `@hyprpay/core`

### Sim

- criar `transports/orpc`
- usar oRPC como **surface pública oficial de endpoints**
- manter o core chamável diretamente via `hyprpay.api.*`

## Mapeamento recomendado

```text
hyprpay.api.catalog.products.create      -> orpc.catalog.products.create
hyprpay.api.catalog.prices.create        -> orpc.catalog.prices.create
hyprpay.api.customers.create             -> orpc.customers.create
hyprpay.api.checkouts.create             -> orpc.checkouts.create
hyprpay.api.subscriptions.create         -> orpc.subscriptions.create
hyprpay.api.subscriptions.cancel         -> orpc.subscriptions.cancel
hyprpay.api.orders.get/list/create       -> orpc.orders.*
hyprpay.api.refunds.create/list          -> orpc.refunds.*
```

## Queries e mutations

No servidor oRPC a distinção não é `.query()` vs `.mutation()` como tRPC clássico; a procedure é `.handler()`. A semântica de query/mutation aparece muito bem do lado do cliente TanStack via:

- `.queryOptions`
- `.mutationOptions`

Isso encaixa perfeitamente no que você quer para mutations.

## Regras de desenho de endpoint

### 1. usar OpenAPIHandler, não RPCHandler, para a API pública

### 2. declarar `method` e `path` explicitamente

Exemplo conceitual:

```ts
POST   /billing/customers
POST   /billing/checkouts
POST   /billing/subscriptions
POST   /billing/subscriptions/{id}/cancel
GET    /billing/orders/{id}
POST   /billing/refunds
```

### 3. usar `inputStructure: "detailed"` quando houver headers/query/body/params relevantes

Isso será importante para:

- idempotency keys
- tenant headers
- auth headers
- webhooks

### 4. padronizar tradução de erro

O domínio retorna `BillingResult<T>`. O oRPC precisa expor erro HTTP idiomático.

Criar mapper único:

```ts
BillingResult<T> -> T | ORPCError
```

Nunca expor `Result` serializado como payload público.

## Webhooks

Webhooks são o único ponto em que eu **não** forçaria o oRPC como camada única.

Motivo:

- assinatura frequentemente depende de raw body
- body parsing pode quebrar a verificação em alguns adapters

Decisão recomendada:

- manter webhook como rota fetch/raw dedicada
- o transport oRPC pode coexistir com um fetch handler raw para webhook

---

## Better Auth integration

## Veredito

Sim, faz sentido criar `integrations/better-auth`.

Docs oficiais usadas:

- database: https://better-auth.com/docs/concepts/database
- hooks: https://better-auth.com/docs/concepts/hooks

## O que Better Auth realmente resolve aqui

- lifecycle de criação/login de usuário
- hooks before/after
- acesso a `ctx.path`, `ctx.body`, `ctx.headers`, `ctx.context.newSession`
- possibilidade de sincronizar identity com billing

## O que Better Auth **não** resolve sozinho

- modelagem fiscal brasileira
- CPF/CNPJ obrigatório
- customer billing completo
- PSP customer provisioning sem mapping de domínio

## Problema real do repo atual

`plugins/customers/src/schemas/customer-schema.ts` exige:

- `name`
- `email`
- `document`

Então o sync automático Better Auth → customer **não pode** ser "criou usuário = cria customer sempre" de forma cega.

### Decisão recomendada

Criar dois níveis:

#### 1. link auth ↔ billing

Sempre possível.

#### 2. provisioning de customer no PSP

Só quando os dados fiscais mínimos existirem.

## Tabela nova recomendada

Em `integrations/better-auth` ou `orms/drizzle`:

```text
billing_auth_links
- id
- auth_user_id
- billing_customer_id
- provider
- provider_account_id
- last_synced_at
- created_at
- updated_at
```

Constraints:

- unique(`auth_user_id`)
- unique(`billing_customer_id`)

## Estratégia de sync

### No signup/login

- Better Auth after hook roda
- cria/atualiza link auth ↔ billing actor
- se houver dados mínimos de billing, cria ou reconcilia customer
- se não houver, deixa customer pendente

### Recomendação concreta

API de integração:

```ts
createBetterAuthBillingSync({
  hyprpay,
  auth,
  store,
  mapUserToCustomerDraft,
})
```

`mapUserToCustomerDraft` precisa ser obrigatório e definido pela aplicação.

Motivo:

- cada app sabe de onde vem CPF/CNPJ
- o core não deve inventar regra fiscal

---

## Drizzle + Zod strategy

## Decisão principal

Você quer que tudo venha de drizzle-zod enquanto só existe Drizzle. A forma segura de executar essa direção é:

- usar `drizzle-orm/zod` como fonte da **camada de persistência**
- usar schemas de domínio compostos/refinados para a **camada pública**

## Regra de ouro

### Banco

- `createSelectSchema(table)`
- `createInsertSchema(table)`
- `createUpdateSchema(table)`

### Domínio/API

- schema explícito do plugin
- pode reutilizar partes do schema gerado
- não deve vazar colunas internas/nullable/generated automaticamente

## Por que não usar tabela crua como API pública

Porque tabela e API têm preocupações diferentes:

- tabela tem nullability, generated columns, timestamps, ids internos, colunas de reconciliação
- API tem defaults semânticos, invariantes de negócio, shape estável, compatibilidade

Exemplo do próprio Drizzle:

- `createSelectSchema(users)` espera row completa
- se fizer partial select, o parse falha

Fonte oficial:

- https://orm.drizzle.team/docs/zod

## Implementação recomendada no `orms/drizzle`

```text
orms/drizzle/src/
  schema/
    billing-products.table.ts
    billing-prices.table.ts
    billing-customers.table.ts
    billing-orders.table.ts
    billing-refunds.table.ts
  zod/
    billing-product-db-schemas.ts
    billing-price-db-schemas.ts
    billing-customer-db-schemas.ts
  repositories/
    catalog-repository.ts
    customers-repository.ts
    orders-repository.ts
    refunds-repository.ts
```

### Convenção de nomes

Evitar nomes ambíguos como:

- `billingCustomerInsertSchema`

Preferir:

- `billingCustomerDbInsertSchema`
- `billingCustomerDbSelectSchema`
- `billingCustomerDbUpdateSchema`

---

## Dinero.js strategy

Docs oficiais usadas:

- amount: https://www.dinerojs.com/core-concepts/amount
- currency: https://www.dinerojs.com/core-concepts/currency
- scale: https://www.dinerojs.com/core-concepts/scale

## Veredito

Sim. Dinero.js é uma boa escolha para o HyprPay.

## Por quê

- trabalha com inteiro na menor unidade
- rejeita float
- suporta escala para proration, taxas e percentuais
- encaixa muito bem com BRL-only em centavos

## Regra proposta

### API pública

Continua simples:

```ts
amount: number // centavos
currency: "BRL"
```

### Implementação interna

Usa Dinero.js para:

- desconto percentual/fixo
- proration
- rate calculation
- split/allocation
- cálculo de imposto quando houver
- overage/metered close

## Importante

- não vazar objeto `Dinero` na API pública
- expor centavos BRL
- se usar `scale` custom, persistir `scale` ou arredondar antes de salvar/cobrar

## Package recomendado

```text
shared/money
```

Expor helpers como:

- `brl(amount)`
- `multiplyRate(amount, rate)`
- `allocate(amount, ratios)`
- `prorate(period, changeAt)`
- `trimMoneyScale(value)`

---

## Shared layer

## `shared/http`

Você pediu `ky` como padrão de HTTP. Faz sentido.

## Responsabilidades

- `createHttpClient()`
- headers padrão
- timeout padrão
- retry policy default = 0 para PSPs, explícito por caller
- parse JSON seguro
- validação Zod de response
- erro HTTP normalizado

## Exemplo conceitual

```text
shared/http/
  create-http-client.ts
  http-error.ts
  parse-json.ts
  validate-json.ts
  request-options.ts
```

## Regra

- gateways falam HTTP só via `shared/http`
- nenhum gateway importa `ky` diretamente fora dessa camada

## `shared/money`

Já descrito acima.

---

## Debloat do gateway AbacatePay

## Objetivo

O gateway precisa deixar de ser uma mini-framework interna.

## Problemas atuais

- split excessivo entre `operations/` e `mappers/`
- factory monolítica
- stub duplication de config inválida
- dependências sobrando (`dayjs`)
- config sem efeito (`environment`)
- webhook verification confusa

## Estrutura recomendada

```text
gateways/abacatepay/src/
  index.ts
  create-abacatepay-gateway.ts

  client/
    create-abacatepay-client.ts
    abacatepay-endpoints.ts

  providers/
    catalog-provider.ts
    customers-provider.ts
    checkouts-provider.ts
    subscriptions-provider.ts
    webhooks-provider.ts

  schemas/
    abacatepay-request-schemas.ts
    abacatepay-response-schemas.ts

  shared/
    map-charge-status.ts
    map-checkout-status.ts
    map-subscription-status.ts
    map-webhook-event.ts
```

## Regras concretas

### 1. remover `operations/` + `mappers/` como layers genéricas

Cada capability provider deve conter:

- input mapping
- call HTTP
- output mapping

no mesmo módulo do capability.

### 2. eliminar `invalidConfigGateway`

No lugar disso:

- validar config uma vez
- compartilhar helper `withClient()`
- quando config inválida, todos os methods retornam erro via helper comum

### 3. `environment` tem que valer de verdade

Se existir no schema, precisa selecionar base URL de sandbox/production.

### 4. `webhookSecret` precisa ter papel claro

Hoje ele só compara query string em `verify-webhook.ts`. Isso é fraco e semântico demais.

Decisão:

- ou ele participa da assinatura real
- ou sai do contrato

### 5. remover deps mortas

- `dayjs` parece morta no package atual

### 6. separar id local de id do provider

Hoje `abacatepay-customer-mapper.ts` faz:

- `id: response.id`
- `providerCustomerId: response.id`

Isso é perigoso para sync com auth, reconciliação e migração futura.

Regra nova:

- `id` local é do HyprPay
- `providerCustomerId` é do PSP

---

## Mudanças de domínio necessárias

## 1. `catalog`

Trocar shape simplista por shape orientado a strategy.

Hoje:

- `usageBased: boolean`
- interval simples

Proposta:

- `billingStrategy`
- `billingMode`
- `trialPolicy`
- `pricingModel`
- possivelmente `components` para hybrid

## 2. `customers`

Adicionar conceito de identidade local desvinculada do provider.

Necessidades:

- `id` local
- `providerCustomerId`
- `auth link` opcional via integração
- `documentStatus`/`billingProfileStatus` no futuro

## 3. `orders`

Novo plugin obrigatório.

Responsável por:

- registrar cada transação financeira
- carregar `billingReason`
- relacionar checkout/subscription/refund
- ser a entidade principal para relatórios e reconciliação

## 4. `refunds`

Novo plugin obrigatório.

Responsável por:

- refund total/parcial
- relação com order
- efeito financeiro explícito
- eventos de refund

## 5. `discounts`

Novo plugin recomendado.

Responsável por:

- cupom/desconto
- percentual/fixo
- duração
- restrições

## 6. `meters`

Novo plugin recomendado.

Responsável por:

- definição de meter
- ingestão de eventos de uso
- agregação
- snapshots por ciclo

## 7. `entitlements`

Eu manteria, mas mudaria o papel.

### Hoje

- grant/check/consume genérico

### Futuro

- engine de grants ligada a orders/subscriptions
- grants manuais continuam possíveis, mas separados semanticamente

## 8. `charges`

Decisão recomendada:

- deixar de ser a principal entidade pública do produto
- manter como detalhe de pagamento/provider ou surface low-level opcional

A entidade principal financeira deve ser `order`.

---

## Estrutura recomendada do `transports/orpc`

```text
transports/orpc/src/
  index.ts
  create-hyprpay-orpc-router.ts
  create-hyprpay-openapi-handler.ts
  error/
    billing-result-to-orpc-error.ts
  routers/
    catalog-router.ts
    customers-router.ts
    checkouts-router.ts
    subscriptions-router.ts
    orders-router.ts
    refunds-router.ts
```

## Regras

- cada router chama `hyprpay.api.*`
- nenhum router acessa Drizzle direto
- middleware de auth/tenant é opcional e vem do host app ou integração

---

## Estrutura recomendada do `integrations/better-auth`

```text
integrations/better-auth/src/
  index.ts
  create-better-auth-billing-sync.ts
  hooks/
    create-auth-sync-hooks.ts
  store/
    billing-auth-link-store.ts
  mappers/
    map-user-to-customer-draft.ts
```

## Regras

- criação de customer PSP só quando houver dados fiscais mínimos
- caso contrário, só cria vínculo auth ↔ billing actor
- operação sempre idempotente

---

## Estrutura recomendada do `orms/drizzle`

```text
orms/drizzle/src/
  index.ts

  schema/
    billing-products.table.ts
    billing-prices.table.ts
    billing-customers.table.ts
    billing-checkouts.table.ts
    billing-subscriptions.table.ts
    billing-orders.table.ts
    billing-refunds.table.ts
    billing-webhook-events.table.ts
    billing-entitlements.table.ts
    billing-auth-links.table.ts

  zod/
    billing-product-db-schemas.ts
    billing-price-db-schemas.ts
    billing-customer-db-schemas.ts
    billing-order-db-schemas.ts
    billing-refund-db-schemas.ts

  repositories/
    catalog-repository.ts
    customers-repository.ts
    checkouts-repository.ts
    subscriptions-repository.ts
    orders-repository.ts
    refunds-repository.ts
    webhooks-repository.ts
    entitlements-repository.ts
    billing-auth-links-repository.ts
```

---

## Plano de migração recomendado

## Fase 0 — fundação estrutural

1. mover `adapters/drizzle` → `orms/drizzle`
2. adicionar workspaces `transports/*` e `shared/*`
3. criar `shared/http`
4. criar `shared/money`
5. limpar `gateways/abacatepay` deps mortas e config inconsistente

## Fase 1 — endpoint surface

1. criar `transports/orpc`
2. publicar routers para `catalog`, `customers`, `checkouts`, `subscriptions`
3. criar mapper central `BillingResult -> ORPCError`
4. manter webhook em handler raw/fetch

## Fase 2 — financial core de verdade

1. criar plugin `orders`
2. criar plugin `refunds`
3. mover `charges` para papel secundário
4. introduzir Dinero nas contas de desconto/proration/refund

## Fase 3 — schema discipline

1. trocar aliases Zod atuais por `drizzle-orm/zod`
2. separar schemas DB e schemas de domínio
3. renomear exports ambíguos

## Fase 4 — auth integration

1. criar `integrations/better-auth`
2. adicionar tabela de vínculo auth ↔ billing
3. implementar sync idempotente
4. só provisionar customer completo quando houver dados fiscais válidos

## Fase 5 — Polar-like advanced billing

1. `discounts`
2. `meters`
3. `hybrid base + usage`
4. `seats`

---

## Decisões finais

## Decisão 1

**oRPC entra como transport oficial de endpoints, mas fora do core.**

Motivo:

- mantém `@hyprpay/core` mínimo
- entrega typed mutations/queries/OpenAPI
- encaixa com TanStack

## Decisão 2

**Drizzle vira `orms/drizzle`.**

Motivo:

- é ORM package, não adapter genérico
- a pasta `adapters/` como workspace público só adiciona ruído

## Decisão 3

**`drizzle-zod` significa `drizzle-orm/zod`, não o pacote deprecated.**

Motivo:

- essa é a direção oficial do Drizzle hoje

## Decisão 4

**schemas de banco e schemas públicos não serão a mesma coisa.**

Motivo:

- usar tabela crua como API pública é acoplamento indevido
- mas a base de persistência deve sim vir do Drizzle

## Decisão 5

**Better Auth entra como integração opcional.**

Motivo:

- auth não é parte do billing core
- sync automático depende de dados fiscais do app

## Decisão 6

**Dinero.js entra por trás da boundary pública.**

Motivo:

- cálculo de dinheiro precisa ser correto
- a API pública pode continuar simples em centavos BRL

## Decisão 7

**`orders` e `refunds` precisam virar recursos de primeira classe antes de chamar isso de billing core inspirado na Polar.**

Motivo:

- é o centro financeiro do sistema
- `charges` sozinha não basta

---

## O que fica fora de escopo agora

- SDKs próprios
- OAuth
- Merchant of Record
- multi-currency
- customer portal completo estilo Polar
- abstração multi-ORM antes de existir outro ORM real

---

## Conclusão

A melhor direção para o HyprPay é:

- **core plugin-first e frameworkless**
- **surface HTTP em oRPC**
- **persistência oficial em `orms/drizzle`**
- **integração de auth em `integrations/better-auth`**
- **fundação compartilhada em `shared/http` e `shared/money`**
- **gateway PSP muito mais fino**
- **orders/refunds como centro do modelo financeiro**
- **billing strategies explícitas, não booleans escondidos**

Esse desenho preserva o que já está bom no projeto e corta o bloat onde ele mais dói.

## Fontes externas

- Polar products: https://polar.sh/docs/features/products
- Polar subscriptions manage: https://polar.sh/docs/features/subscriptions/manage
- Polar proration: https://polar.sh/docs/features/subscriptions/proration
- Polar usage billing intro: https://polar.sh/docs/features/usage-based-billing/introduction
- Polar meters: https://polar.sh/docs/features/usage-based-billing/meters
- Polar seat-based pricing: https://polar.sh/docs/features/seat-based-pricing
- Polar discounts: https://polar.sh/docs/features/discounts
- Polar orders: https://polar.sh/docs/features/orders
- Polar refunds: https://polar.sh/docs/features/refunds
- Polar benefits: https://polar.sh/docs/features/benefits/introduction
- oRPC procedures: https://orpc.dev/docs/procedure
- oRPC router: https://orpc.dev/docs/router
- oRPC OpenAPI routing: https://orpc.dev/docs/openapi/routing
- oRPC input/output structure: https://orpc.dev/docs/openapi/input-output-structure
- oRPC TanStack Query: https://orpc.dev/docs/integrations/tanstack-query
- Better Auth database: https://better-auth.com/docs/concepts/database
- Better Auth hooks: https://better-auth.com/docs/concepts/hooks
- Drizzle Zod: https://orm.drizzle.team/docs/zod
- Dinero amount: https://www.dinerojs.com/core-concepts/amount
- Dinero currency: https://www.dinerojs.com/core-concepts/currency
- Dinero scale: https://www.dinerojs.com/core-concepts/scale
