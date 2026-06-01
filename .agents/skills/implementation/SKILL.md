---
name: implementation
description: Guia de implementação do HyprPay para core, adapters, schemas, errors, testes e validação. Use ao criar, migrar, refatorar ou testar código em packages/*.
---

# Implementation

Use esta skill antes de alterar código no HyprPay.

## Leia também

- Provider adapters, HTTP, webhooks e normalização: `references/provider-adapters.md`.
- Erros, `better-result` e `evlog`: `references/errors.md`.

## Regras sempre ativas

- API pública em inglês.
- Mensagens visíveis ao usuário em pt-BR.
- 100% Zod em inputs, outputs e payloads externos.
- 100% `better-result` para falhas esperadas.
- 100% `evlog` para catálogos de erro.
- Sem `try/catch` em código de produção; use `Result.tryPromise`.
- Sem `as` em TypeScript de produção.
- Sem barrel files: não criar arquivo que só reexporta outros módulos.
- Sem framework web; libraries devem rodar em Bun/Node/Edge quando possível.
- Provider bruto não cruza boundary: normalize para schemas do `@hyprpay/core`.
- Payload bruto de provider só pode aparecer em `BillingEvent.payload`.
- Arquivos em kebab-case, exceto entrypoints já publicados.

## Estrutura

```text
packages/core/     # runtime createHyprPay, schemas, contratos, entitlements, errors
packages/asaas/    # adapter Asaas
```

## API style

Inspiração: Better Auth.

- Runtime por factory: `createHyprPay({ provider })`.
- Sub APIs pequenas: `customers.create`, `charges.create`, `subscriptions.create`.
- Adapters são plugins de provider, não subclasses.
- Schemas ficam próximos dos contratos.
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
bun run --cwd packages/core typecheck
bun run --cwd packages/asaas typecheck
```
