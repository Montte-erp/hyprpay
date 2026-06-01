import { TaggedError } from "better-result";
import { defineErrorCatalog } from "evlog";

export const billingErrors = defineErrorCatalog("hyprpay.billing", {
  INVALID_INPUT: {
    status: 400,
    message: "Dados de billing inválidos.",
    tags: ["hyprpay", "billing"],
  },
  PROVIDER_REQUEST_FAILED: {
    status: 502,
    message: "Falha ao chamar o provedor de pagamento.",
    tags: ["hyprpay", "billing", "provider"],
  },
  PROVIDER_RESPONSE_INVALID: {
    status: 502,
    message: "Resposta inválida do provedor de pagamento.",
    tags: ["hyprpay", "billing", "provider"],
  },
  ENTITLEMENT_DENIED: {
    status: 403,
    message: "Cliente não possui acesso a este recurso.",
    tags: ["hyprpay", "billing", "entitlement"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "hyprpay.billing": typeof billingErrors;
  }
}

export class BillingError extends TaggedError("BillingError")<{
  error:
    | ReturnType<typeof billingErrors.INVALID_INPUT>
    | ReturnType<typeof billingErrors.PROVIDER_REQUEST_FAILED>
    | ReturnType<typeof billingErrors.PROVIDER_RESPONSE_INVALID>
    | ReturnType<typeof billingErrors.ENTITLEMENT_DENIED>;
  message: string;
  provider?: string;
  status?: number;
}>() {}
