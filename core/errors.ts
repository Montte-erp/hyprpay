import { Data } from "effect";

export class InvalidInput extends Data.TaggedError("InvalidInput")<{
  readonly message: string;
  readonly status: 400;
}> {}

export class NotFound extends Data.TaggedError("NotFound")<{
  readonly message: string;
  readonly status: 404;
}> {}

export class StoreFailed extends Data.TaggedError("StoreFailed")<{
  readonly message: string;
  readonly status: 500;
}> {}

export class ProviderRequestFailed extends Data.TaggedError("ProviderRequestFailed")<{
  readonly message: string;
  readonly provider: string;
  readonly status?: number;
}> {}

export class ProviderResponseInvalid extends Data.TaggedError("ProviderResponseInvalid")<{
  readonly message: string;
  readonly provider: string;
}> {}

export class WebhookVerificationFailed extends Data.TaggedError("WebhookVerificationFailed")<{
  readonly message: string;
  readonly provider: string;
}> {}

export class CapabilityUnsupported extends Data.TaggedError("CapabilityUnsupported")<{
  readonly capability: string;
  readonly message: string;
  readonly status: 501;
}> {}

export type HyprPayError =
  | InvalidInput
  | NotFound
  | StoreFailed
  | ProviderRequestFailed
  | ProviderResponseInvalid
  | WebhookVerificationFailed
  | CapabilityUnsupported;

export const invalidInput = (): InvalidInput =>
  new InvalidInput({
    message: "Dados de billing inválidos.",
    status: 400,
  });

export const notFound = (): NotFound =>
  new NotFound({
    message: "Recurso de billing não encontrado.",
    status: 404,
  });

export const storeFailed = (): StoreFailed =>
  new StoreFailed({
    message: "Falha ao persistir dados de billing.",
    status: 500,
  });

export const providerRequestFailed = (provider: string, status?: number): ProviderRequestFailed =>
  new ProviderRequestFailed({
    message: "Falha ao chamar o provedor de pagamento.",
    provider,
    ...(status === undefined ? {} : { status }),
  });

export const providerResponseInvalid = (provider: string): ProviderResponseInvalid =>
  new ProviderResponseInvalid({
    message: "Resposta inválida do provedor de pagamento.",
    provider,
  });

export const webhookVerificationFailed = (provider: string): WebhookVerificationFailed =>
  new WebhookVerificationFailed({
    message: "Falha ao verificar webhook do provedor de pagamento.",
    provider,
  });

export const capabilityUnsupported = (capability: string): CapabilityUnsupported =>
  new CapabilityUnsupported({
    capability,
    message: "Capability de billing não suportada pelo provider.",
    status: 501,
  });
