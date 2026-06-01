# Errors — better-result + evlog

Use esta referência ao criar ou alterar falhas esperadas.

## Regras

- Importe `Result` e `TaggedError` de `better-result`.
- Importe `defineErrorCatalog` de `evlog`.
- Falhas esperadas retornam `Result<T, BillingError>` ou erro específico do bounded context.
- Não retorne `string`, `Error`, `unknown` ou objeto cru como erro.
- Não use `throw` para regra de negócio, provider indisponível, payload inválido ou webhook inválido.
- Não use `try/catch`; use `Result.tryPromise`.
- Mensagens user-facing em pt-BR.

## Catálogo

Cada bounded context define catálogo local:

```ts
const providerErrors = defineErrorCatalog("hyprpay.asaas", {
  INVALID_CONFIG: {
    status: 400,
    message: "Configuração do Asaas inválida.",
    tags: ["hyprpay", "asaas"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "hyprpay.asaas": typeof providerErrors;
  }
}
```

Use nomes específicos:

- `hyprpay.billing`
- `hyprpay.asaas`
- `hyprpay.webhooks`
- `hyprpay.entitlements`

Evite nomes largos como `app`, `common`, `errors`.

## TaggedError

Use uma classe por bounded context quando necessário. Para erros centrais, `BillingError` vive em `packages/core/src/errors.ts`.

Payload pequeno:

- `error`
- `message`
- `provider?`
- `status?`
- ids operacionais quando existirem

Não incluir:

- `cause: unknown`
- response bruto de provider
- objeto inteiro de SDK
- request body completo

## Result.tryPromise

```ts
const responseResult = await Result.tryPromise({
  try: () => fetch(url, init),
  catch: () =>
    new BillingError({
      error: billingErrors.PROVIDER_REQUEST_FAILED(),
      message: "Falha ao chamar o provedor de pagamento.",
      provider: "asaas",
    }),
});

if (Result.isError(responseResult)) {
  return responseResult;
}
```

## Zod parse

Use `safeParse` e converta falha para `Result.err` tipado.

```ts
const parsed = schema.safeParse(input);

if (!parsed.success) {
  return Result.err(
    new BillingError({
      error: billingErrors.INVALID_INPUT(),
      message: "Dados de billing inválidos.",
    }),
  );
}
```

## Checklist

- Erro tem catálogo `evlog`?
- `TaggedError` carrega o catalog error concreto?
- Mensagem está em pt-BR?
- Sem `try/catch`?
- Sem erro bruto de provider atravessando boundary?
- Sem `Result<..., string | Error | unknown>`?
