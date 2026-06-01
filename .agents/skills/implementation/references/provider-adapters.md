# Provider adapters

Use esta referência ao criar ou alterar adapters de pagamento.

## Contrato

Adapters implementam `PaymentProviderAdapter` de `@hyprpay/core/adapter`:

```ts
interface PaymentProviderAdapter {
  id: string;
  createCustomer(input: CustomerInput): Promise<BillingResult<Customer>>;
  createCheckout(input: CheckoutInput): Promise<BillingResult<Checkout>>;
  createCharge(input: ChargeInput): Promise<BillingResult<Charge>>;
  createSubscription(input: SubscriptionInput): Promise<BillingResult<Subscription>>;
  parseWebhook(input: Request): Promise<BillingResult<BillingEvent>>;
}
```

## Regras

- Adapter nunca expõe formato bruto do provider no sucesso.
- Response externo passa por Zod antes de virar entidade core.
- Request externa usa `Result.tryPromise`.
- Erros HTTP viram `BillingError` com catálogo `PROVIDER_REQUEST_FAILED`.
- JSON inválido/schema inválido vira `PROVIDER_RESPONSE_INVALID`.
- Webhook normaliza para `BillingEvent`.
- Payload bruto do webhook pode ficar em `BillingEvent.payload`.
- Não modele features avançadas antes do core suportar contrato limpo.

## Mapeamentos

Cada adapter deve ter funções locais para converter:

- payment method core → provider;
- status provider → status core;
- event provider → `BillingEvent.type`;
- amount em centavos core → formato provider.

Exemplo:

```ts
const toPaymentMethod = (method: ChargeInput["method"]) => {
  if (method === "pix") return "PIX";
  if (method === "boleto") return "BOLETO";
  return "CREDIT_CARD";
};
```

## Checkout MVP

Enquanto não houver hosted checkout próprio, adapters podem implementar checkout como payment link/provider checkout mínimo. Deixe explícito e mantenha o contrato `Checkout` estável.

## Novo provider

1. Criar `packages/<provider>/package.json`.
2. Criar `packages/<provider>/src/<provider>.ts`.
3. Adicionar reference em `tsconfig.json` raiz.
4. Adicionar path/export se necessário.
5. Implementar adapter mínimo.
6. Rodar `bun run typecheck` e `bun run build`.

## Checklist

- Todos os inputs externos têm schema Zod?
- Todos os outputs externos têm schema Zod?
- Não há provider response bruto no retorno público?
- Webhooks estão normalizados?
- Erros estão tipados e com evlog?
- Sem `try/catch` e sem `as`?
