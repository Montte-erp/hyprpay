# Provider adapters

Use esta referência ao criar ou alterar gateways/adapters de pagamento.

## Contrato

Adapters implementam `PaymentProviderAdapter` de `@hyprpay/core/adapter`:

```ts
interface PaymentProviderAdapter {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  createCustomer(input: CustomerInput): Effect.Effect<CustomerRef, ProviderError>;
  createCheckout(input: ProviderCheckoutInput): Effect.Effect<CheckoutRef, ProviderError>;
  createSubscription(input: ProviderSubscriptionInput): Effect.Effect<SubscriptionRef, ProviderError>;
  refund(input: RefundInput): Effect.Effect<RefundRef, ProviderError>;
  parseWebhook(input: WebhookRequest): Effect.Effect<BillingEvent, WebhookError>;
}
```

`ProviderCheckoutInput` e `ProviderSubscriptionInput` incluem o `Customer` core já persistido. Use `customer.providerCustomerId` quando o gateway exige o ID remoto.

Benefits, entitlements, meters, license keys, downloads, seats e customer portal são capabilities do core. Gateways só implementam o ciclo de pagamento que o provedor realmente oferece.

## Regras

- Adapter nunca expõe formato bruto do provider no sucesso.
- Response externo passa por Effect Schema antes de virar entidade core.
- Request externa usa `Effect.tryPromise`.
- Erros HTTP viram tagged errors `ProviderRequestFailed`.
- JSON inválido/schema inválido vira `ProviderResponseInvalid`.
- Webhook normaliza para `BillingEvent`.
- Payload bruto do webhook pode ficar em `BillingEvent.payload`.
- Capability ausente vira erro tipado `CapabilityUnsupported`, nunca no-op.
- Core não sabe de SDK oficial, HMAC custom, payment links ou payloads provider-specific.

## Mapeamentos

Cada adapter deve ter funções locais para converter:

- payment method core (`pix`, `boleto`, `card`) → provider;
- status provider → status core;
- event provider → `BillingEvent.type`;
- amount em centavos core → formato provider;
- URL/hosted checkout provider → `CheckoutRef.checkoutUrl`.

Exemplo:

```ts
const toPaymentMethod = (method: "pix" | "boleto" | "card") => {
  if (method === "pix") return "PIX";
  if (method === "boleto") return "BOLETO";
  return "CREDIT_CARD";
};
```

## Checkout MVP

Adapters podem implementar checkout como payment link/provider hosted charge mínimo. Deixe explícito e mantenha o contrato `Checkout` estável.

## Novo provider

1. Criar `gateways/<provider>/package.json`.
2. Criar `gateways/<provider>/src/index.ts`.
3. Declarar capabilities suportadas.
4. Implementar mapeadores puros testáveis.
5. Validar response/webhook com Effect Schema mínimo.
6. Rodar validação focada e workspace.

## Checklist

- Todos os inputs externos têm Effect Schema?
- Todos os outputs externos têm Effect Schema?
- Não há provider response bruto no retorno público?
- Webhooks estão normalizados e verificados quando o provider oferece secret/assinatura?
- Erros estão tipados como tagged errors?
- Sem `try/catch` e sem `as`?
