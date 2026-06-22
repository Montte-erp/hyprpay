# HyprPay — Agent Guidelines

Library monorepo TypeScript para billing brasileiro, inspirado na ergonomia do Better Auth/PayKit: APIs pequenas, composáveis, provider adapters, Effect-first, schema-first e runtime sem framework.

## Comandos

```bash
bun install
bun run typecheck
bun run build
bun test
```

## Skills

Skills vivem em `.agents/skills/<name>/SKILL.md`.

Antes de trabalhar em qualquer área do HyprPay, abra a skill correspondente. A skill é a fonte de verdade para regras atuais, referências, workflow e validação.

| Área | Open this skill |
|------|-----------------|
| Implementação em `core/*`, `gateways/*`, `stores/*`, `integrations/*` | [implementation](.agents/skills/implementation/SKILL.md) |
| Review comments, PR findings, bugs, diffs, CI findings | [code-review](.agents/skills/code-review/SKILL.md) |
| Security audit, webhook security, secrets, provider payloads | [security-audit](.agents/skills/security-audit/SKILL.md) |

Quando a tarefa cruzar áreas, abra cada skill relevante. Exemplo: corrigir webhook inseguro usa [security-audit](.agents/skills/security-audit/SKILL.md), [code-review](.agents/skills/code-review/SKILL.md) e [implementation](.agents/skills/implementation/SKILL.md).

## Regras

- Código público em inglês; mensagens de erro user-facing em pt-BR.
- 100% Effect Schema para input/output em boundaries.
- 100% Effect para falhas esperadas; erros esperados vivem no error channel, não em `string`/`Error`/`unknown`.
- Erros de domínio são tagged errors com payload pequeno e mensagens pt-BR.
- Sem barrel files: não criar arquivos que só reexportam outros módulos.
- Sem `as` em TypeScript de produção.
- Sem `try/catch` em código de produção; use `Effect.tryPromise`.
- Sem dependência de framework web.
- Gateways vivem em `gateways/<provider>` e implementam os contratos de `@hyprpay/core`.
- Arquivos em kebab-case.

## Estrutura

```text
core/                         # @hyprpay/core; domínios locais + runtime
core/cli/                     # @hyprpay/cli; Effect/CLI helper estilo PayKit
stores/postgres/              # Postgres Drizzle v1 RC; fonte da verdade
gateways/asaas/               # gateway Asaas
gateways/abacate-pay/         # gateway Abacate Pay
integrations/alchemy/         # integração opcional Alchemy v2
integrations/better-auth/     # plugin server/client Better Auth
docs/                         # Astro docs site; conteúdo original de integração
```

## MVP

- Core billing runtime em Effect, sem gateway SDK acoplado.
- Customers, hosted checkout/charges, orders, subscriptions, refunds e webhooks normalizados.
- Store Postgres Drizzle como persistência primária; nada de store in-memory em produção.
- Catalog DSL inspirado em PayKit: products, plans, features e benefits em código.
- Capabilities Polar-like locais: benefits, entitlements, meters, license keys, downloads, seats e customer portal sessions.
- Gateways iniciais: Asaas e Abacate Pay. Polar é inspiração de DX, não dependência arquitetural.
