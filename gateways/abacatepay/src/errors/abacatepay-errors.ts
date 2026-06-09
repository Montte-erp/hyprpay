import { TaggedError } from "better-result";
import { defineErrorCatalog } from "evlog";
import { abacatePayErrors } from "./abacatepay-error-catalog";

export interface BillingErrorEntry {
  status: number;
  message: string;
  tags?: string[];
}

export class BillingError extends TaggedError("BillingError")<{
  error: BillingErrorEntry;
  message: string;
  provider?: string;
  status?: number;
}>() {}

export const billingErrors = defineErrorCatalog("hyprpay.abacatepay.billing", {
  INVALID_INPUT: {
    status: 400,
    message: "Dados de billing inválidos.",
    tags: ["hyprpay", "billing", "abacatepay"],
  },
  PROVIDER_REQUEST_FAILED: {
    status: 502,
    message: "Falha ao chamar o provedor de pagamento.",
    tags: ["hyprpay", "billing", "provider", "abacatepay"],
  },
  PROVIDER_RESPONSE_INVALID: {
    status: 502,
    message: "Resposta inválida do provedor de pagamento.",
    tags: ["hyprpay", "billing", "provider", "abacatepay"],
  },
  UNSUPPORTED_CAPABILITY: {
    status: 400,
    message: "O provider não suporta esta operação.",
    tags: ["hyprpay", "billing", "provider", "abacatepay"],
  },
  INVALID_WEBHOOK_SIGNATURE: {
    status: 401,
    message: "Assinatura do webhook inválida.",
    tags: ["hyprpay", "billing", "webhook", "abacatepay"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "hyprpay.abacatepay.billing": typeof billingErrors;
  }
}

export type BillingResult<T> = import("better-result").Result<T, BillingError>;

export const invalidAbacatePayConfig = () =>
  new BillingError({
    error: billingErrors.INVALID_INPUT(),
    message: abacatePayErrors.INVALID_CONFIG().message,
    provider: "abacatepay",
  });

export const abacatePayRequestError = (message: string, status?: number) =>
  new BillingError({
    error: billingErrors.PROVIDER_REQUEST_FAILED(),
    message,
    provider: "abacatepay",
    ...(status === undefined ? {} : { status }),
  });

export const abacatePayResponseError = (message: string) =>
  new BillingError({
    error: billingErrors.PROVIDER_RESPONSE_INVALID(),
    message,
    provider: "abacatepay",
  });

export const abacatePayWebhookSignatureError = () =>
  new BillingError({
    error: billingErrors.INVALID_WEBHOOK_SIGNATURE(),
    message: "Assinatura do webhook da AbacatePay inválida.",
    provider: "abacatepay",
  });
