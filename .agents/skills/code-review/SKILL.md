---
name: code-review
description: Workflow de code review do HyprPay para revisar PRs, diffs, bugs e achados de CI em packages/*.
---

# Code Review

Use esta skill ao revisar mudanças no HyprPay.

## Foco

1. Contrato público e breaking changes.
2. Uso correto de Zod nas boundaries.
3. Uso correto de `better-result` para falhas esperadas.
4. Catálogos `evlog` locais e mensagens em pt-BR.
5. Normalização de provider sem vazar payload bruto.
6. Ausência de barrel files, `try/catch` e `as` em produção.

## Checklist

- O pacote exporta apenas subpaths intencionais em `package.json#exports`?
- O código público continua inspirado em Better Auth: factory, sub APIs pequenas, plugins/adapters?
- Inputs públicos são validados com Zod?
- Responses de provider são validadas com Zod?
- Falhas esperadas retornam `Result`?
- Erros têm `defineErrorCatalog` via `evlog`?
- Mensagens user-facing estão em pt-BR?
- O adapter não acopla o core ao provider?
- O webhook é normalizado para `BillingEvent`?
- `bun run typecheck`, `bun run build` e `git diff --check` passam?

## Severidade

- P0: vazamento de segredo, execução remota, quebra de auth/assinatura de webhook.
- P1: contrato público quebrado, erro esperado via throw, response sem validação, provider bruto no retorno público.
- P2: ergonomia ruim, duplicação relevante, naming confuso.
- P3: estilo, docs, pequenos ajustes.

## Formato de findings

```md
[P1] Título curto
Arquivo: `path/to/file.ts`

Evidência objetiva.
Impacto real.
Correção sugerida.
```
