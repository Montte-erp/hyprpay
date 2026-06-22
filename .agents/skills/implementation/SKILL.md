---
name: implementation
description: Guia de implementação do HyprPay para core, gateways, stores, schemas, errors, testes e validação. Use ao criar, migrar, refatorar ou testar código em core/*, gateways/*, stores/* ou integrations/*.
---

# Implementation

Use esta skill antes de alterar código no HyprPay.

## Leia também

- Provider adapters, HTTP, webhooks e normalização: `references/provider-adapters.md`.
- Erros, Effect e tagged errors: `references/errors.md`.

## Regras sempre ativas

- API pública em inglês.
- Mensagens visíveis ao usuário em pt-BR.
- 100% Effect Schema em inputs, outputs e payloads externos.
- 100% Effect para falhas esperadas; erros esperados vivem no error channel.
- Erros de domínio usam tagged errors com payload pequeno e mensagens pt-BR.
- Sem `try/catch` em código de produção; use `Effect.tryPromise`.
- Sem `as` em TypeScript de produção.
- Sem barrel files: não criar arquivo que só reexporta outros módulos.
- Sem framework web; libraries devem rodar em Bun/Node/Edge quando possível.
- Provider bruto não cruza boundary: normalize para schemas do `@hyprpay/core`.
- Payload bruto de provider só pode aparecer em `BillingEvent.payload`.
- Arquivos em kebab-case, exceto entrypoints já publicados.

## Estrutura

```text
core/                         # @hyprpay/core; domínios locais + runtime
core/cli/                     # @hyprpay/cli; Effect/CLI helper estilo PayKit
stores/postgres/              # Postgres Drizzle v1 RC; fonte da verdade
gateways/asaas/               # gateway Asaas
gateways/abacate-pay/         # gateway Abacate Pay
integrations/alchemy/         # integração opcional Alchemy v2
integrations/better-auth/     # plugin server/client Better Auth
apps/docs/                    # Astro landing + docs site
```

## API style

Inspiração: Better Auth, PayKit e DX do Polar sem lock-in de gateway.

- Runtime por factory: `createHyprPay({ provider, store, catalog })`.
- Sub APIs pequenas: `customers.create`, `checkouts.create`, `subscriptions.create`, `refunds.create`, `benefits.grant`, `entitlements.check/report`, `meters.record`, `licenseKeys.issue`, `downloads.getAccess`, `seats.assign`, `portal.createSession`.
- Gateways são plugins de provider, não subclasses.
- Core nunca depende de SDK de gateway; gateways fazem HTTP/SDK mapping.
- Schemas Effect ficam próximos dos contratos.
- CLI usa `@effect/cli`; telemetria opt-in vai por evlog + PostHog, seguindo o padrão Better Auth (`HYPERPAY_TELEMETRY=1`, opt-out explícito).
- Exports públicos explícitos em `package.json#exports`.
- Evite abstrações antes do segundo provider real.

## Workflow

1. Leia o código atual antes de editar.
2. Escolha a referência aplicável.
3. Mantenha diff pequeno.
4. Preserve subpath exports.
5. Rode validação focada.

## Validação

```bash
bun run typecheck
bun run build
git diff --check
```

Se alterar pacote específico:

```bash
bun run --cwd core typecheck
bun run --cwd core test
```
