import { defineErrorCatalog } from "evlog";

export const billingErrors = defineErrorCatalog("hyprpay.customers", {
  INVALID_INPUT: {
    status: 400,
    message: "Dados de billing inválidos.",
    tags: ["hyprpay", "billing", "customers"],
  },
  NOT_FOUND: {
    status: 404,
    message: "Recurso de billing não encontrado.",
    tags: ["hyprpay", "billing", "customers"],
  },
  PROVIDER_REQUEST_FAILED: {
    status: 502,
    message: "Falha ao chamar o provedor de pagamento.",
    tags: ["hyprpay", "billing", "provider", "customers"],
  },
  PROVIDER_RESPONSE_INVALID: {
    status: 502,
    message: "Resposta inválida do provedor de pagamento.",
    tags: ["hyprpay", "billing", "provider", "customers"],
  },
  DATABASE_REQUEST_FAILED: {
    status: 500,
    message: "Falha ao persistir dados de billing.",
    tags: ["hyprpay", "billing", "database", "customers"],
  },
  UNSUPPORTED_CAPABILITY: {
    status: 400,
    message: "O provider não suporta esta operação.",
    tags: ["hyprpay", "billing", "provider", "customers"],
  },
  PROVIDER_MAPPING_REQUIRED: {
    status: 400,
    message: "O catálogo precisa do identificador do produto no provider.",
    tags: ["hyprpay", "billing", "provider", "customers"],
  },
  INVALID_WEBHOOK_SIGNATURE: {
    status: 401,
    message: "Assinatura do webhook inválida.",
    tags: ["hyprpay", "billing", "webhook", "customers"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "hyprpay.customers": typeof billingErrors;
  }
}
