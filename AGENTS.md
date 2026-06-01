# HyprPay — Agent Guidelines

Library monorepo TypeScript para billing brasileiro, inspirado na ergonomia do Better Auth: APIs pequenas, composáveis, provider adapters, schema-first e runtime sem framework.

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
| Implementação em `packages/*` | [implementation](.agents/skills/implementation/SKILL.md) |
| Review comments, PR findings, bugs, diffs, CI findings | [code-review](.agents/skills/code-review/SKILL.md) |
| Security audit, webhook security, secrets, provider payloads | [security-audit](.agents/skills/security-audit/SKILL.md) |

Quando a tarefa cruzar áreas, abra cada skill relevante. Exemplo: corrigir webhook inseguro usa [security-audit](.agents/skills/security-audit/SKILL.md), [code-review](.agents/skills/code-review/SKILL.md) e [implementation](.agents/skills/implementation/SKILL.md).

## Regras

- Código público em inglês; mensagens de erro user-facing em pt-BR.
- 100% Zod para input/output em boundaries.
- 100% better-result para falhas esperadas; não retornar string/Error/unknown como erro.
- 100% evlog para catálogos de erro; cada bounded context define seu próprio catálogo.
- Sem barrel files: não criar arquivos que só reexportam outros módulos.
- Sem `as` em TypeScript de produção.
- Sem `try/catch` em código de produção; use `Result.tryPromise`.
- Sem dependência de framework web.
- Provider adapters vivem em `packages/<provider>` e implementam os contratos de `@hyprpay/core`.
- Arquivos em kebab-case.

## Estrutura

```text
packages/core/     # contratos, schemas, runtime createHyprPay, entitlements
packages/asaas/    # adapter inicial Asaas
```

## MVP

- Core billing runtime.
- Customers, checkout, charges, subscriptions.
- Webhook normalizer.
- Entitlements in-memory simples.
- Asaas como primeiro provider.
