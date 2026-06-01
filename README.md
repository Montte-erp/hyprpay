# HyprPay

Monorepo de libraries TypeScript para billing brasileiro: produtos, preços, clientes, checkout, cobranças, assinaturas, webhooks normalizados e entitlements.

MVP atual:

- `@hyprpay/core`: domínio, contratos Zod, adapter interface e runtime `createHyprPay`.
- `@hyprpay/asaas`: adapter inicial para Asaas com `better-result` e validação Zod.

```ts
import { createHyprPay } from "@hyprpay/core";
import { createAsaasAdapter } from "@hyprpay/asaas";

const hyprpay = createHyprPay({
  provider: createAsaasAdapter({
    apiKey: process.env.ASAAS_API_KEY ?? "",
    environment: "sandbox",
  }),
});

const customer = await hyprpay.customers.create({
  name: "Empresa XPTO",
  email: "financeiro@xpto.com.br",
  document: "12345678000199",
});
```

## Scripts

```bash
bun install
bun run typecheck
bun run build
bun test
```
