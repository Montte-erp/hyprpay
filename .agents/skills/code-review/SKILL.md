---
name: code-review
description: Workflow de code review do HyprPay para revisar PRs, diffs, bugs e achados de CI em core/*, gateways/*, stores/* e integrations/*.
---

# Code Review

Use esta skill ao revisar mudanças no HyprPay.

## Foco

1. Contrato público e breaking changes.
2. Uso correto de Effect Schema nas boundaries.
3. Uso correto do error channel de Effect para falhas esperadas.
4. Tagged errors com mensagens em pt-BR.
5. Normalização de provider sem vazar payload bruto.
6. Ausência de barrel files, `try/catch` e `as` em produção.

## Checklist

- O pacote exporta apenas subpaths intencionais em `package.json#exports`?
- O código público continua inspirado em Better Auth/PayKit: factory, sub APIs pequenas, plugins/adapters?
- Inputs públicos são validados com Effect Schema?
- Responses de provider são validadas com Effect Schema?
- Falhas esperadas vivem no error channel de Effect?
- Erros são tagged errors com payload pequeno?
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
