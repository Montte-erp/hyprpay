# Errors — Effect tagged errors

Use esta referência ao criar ou alterar falhas esperadas.

## Regras

- Importe `Effect` e `Data` de `effect`.
- Falhas esperadas vivem no error channel: `Effect.Effect<TValue, BillingError, R>`.
- Não retorne `string`, `Error`, `unknown` ou objeto cru como erro.
- Não use `throw` para regra de negócio, provider indisponível, payload inválido ou webhook inválido.
- Não use `try/catch`; use `Effect.tryPromise`.
- Mensagens user-facing em pt-BR.

## Tagged errors

Cada bounded context define erros tagged locais quando necessário. Para erros centrais, `BillingError` vive em `core/src/errors.ts`.

```ts
import { Data } from "effect";

export class ProviderRequestFailed extends Data.TaggedError("ProviderRequestFailed")<{
  readonly message: string;
  readonly provider: string;
  readonly status?: number;
}> {}
```

Use nomes específicos:

- `BillingError`
- `ProviderError`
- `WebhookError`
- `EntitlementError`

Evite nomes largos como `AppError`, `CommonError` ou `UnknownError`.

Payload pequeno:

- `message`
- `provider?`
- `status?`
- ids operacionais quando existirem

Não incluir:

- `cause: unknown`
- response bruto de provider
- objeto inteiro de SDK
- request body completo

## Effect.tryPromise

```ts
const response = yield* Effect.tryPromise({
  try: () => fetch(url, init),
  catch: () =>
    new ProviderRequestFailed({
      message: "Falha ao chamar o provedor de pagamento.",
      provider: "asaas",
    }),
});
```

## Effect Schema parse

Use schemas nos boundaries e converta falha para erro tipado.

```ts
const parsed = yield* Schema.decodeUnknown(inputSchema)(input).pipe(
  Effect.mapError(() => new InvalidInput({ message: "Dados de billing inválidos." })),
);
```

## Checklist

- Erro é tagged?
- Mensagem está em pt-BR?
- Sem `try/catch`?
- Sem erro bruto de provider atravessando boundary?
- Sem `Effect<..., string | Error | unknown>`?
