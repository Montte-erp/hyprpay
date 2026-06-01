---
name: security-audit
description: Guia para auditoria de segurança source-code no HyprPay, com foco em providers, webhooks, secrets, payloads externos e billing correctness.
---

# Security Audit

Use esta skill ao auditar segurança no HyprPay.

## Superfícies críticas

- API keys de providers.
- Webhooks e assinatura/verificação de origem.
- Payloads externos de provider.
- Normalização de status de pagamento.
- Idempotência de webhook.
- Cobranças, estornos, chargebacks e assinaturas.
- Entitlements liberados por pagamento.

## Checklist

- Secrets nunca aparecem em logs, errors, payload público ou README.
- Webhook parser valida schema antes de usar dados.
- Falha de parsing retorna erro typed, não sucesso parcial.
- Status desconhecido não vira `paid` por padrão.
- Evento desconhecido não concede entitlement.
- Amount do core é centavos; conversão para provider é explícita.
- Provider response bruto não sai em retorno público, exceto `BillingEvent.payload`.
- Não há `try/catch` engolindo erro.
- Não há `as` escondendo shape externo.
- Erros não carregam request/response completos.

## Findings

Só reporte vulnerabilidade com evidência explorável.

Formato:

```md
[P1] Webhook sem verificação permite marcar pagamento como pago
Arquivo: `packages/<provider>/src/<provider>.ts`

Evidência: ...
Exploit: ...
Impacto: ...
Correção: ...
```
