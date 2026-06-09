import { defineErrorCatalog } from "evlog";

export const billingErrors = defineErrorCatalog("hyprpay.subscriptions", {
  INVALID_INPUT: {
    status: 400,
    message: "Dados de billing inválidos.",
    tags: ["hyprpay", "billing", "subscriptions"],
  },
  NOT_FOUND: {
    status: 404,
    message: "Recurso de billing não encontrado.",
    tags: ["hyprpay", "billing", "subscriptions"],
  },
  PROVIDER_REQUEST_FAILED: {
    status: 502,
    message: "Falha ao chamar o provedor de pagamento.",
    tags: ["hyprpay", "billing", "provider", "subscriptions"],
  },
  PROVIDER_RESPONSE_INVALID: {
    status: 502,
    message: "Resposta inválida do provedor de pagamento.",
    tags: ["hyprpay", "billing", "provider", "subscriptions"],
  },
  DATABASE_REQUEST_FAILED: {
    status: 500,
    message: "Falha ao persistir dados de billing.",
    tags: ["hyprpay", "billing", "database", "subscriptions"],
  },
  UNSUPPORTED_CAPABILITY: {
    status: 400,
    message: "O provider não suporta esta operação.",
    tags: ["hyprpay", "billing", "provider", "subscriptions"],
  },
  PROVIDER_MAPPING_REQUIRED: {
    status: 400,
    message: "O catálogo precisa do identificador do produto no provider.",
    tags: ["hyprpay", "billing", "provider", "subscriptions"],
  },
  INVALID_WEBHOOK_SIGNATURE: {
    status: 401,
    message: "Assinatura do webhook inválida.",
    tags: ["hyprpay", "billing", "webhook", "subscriptions"],
  },
  PRORATION_NOT_APPLICABLE: {
    status: 422,
    message: "Não é possível calcular a cobrança proporcional para esta assinatura.",
    tags: ["hyprpay", "billing", "subscriptions", "proration"],
  },
  SUBSCRIPTION_NOT_CANCELING: {
    status: 409,
    message: "A assinatura não está agendada para cancelamento.",
    tags: ["hyprpay", "billing", "subscriptions"],
  },
  INVALID_SUBSCRIPTION_STATE: {
    status: 409,
    message: "A assinatura está em um estado inválido para esta operação.",
    tags: ["hyprpay", "billing", "subscriptions", "dunning"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "hyprpay.subscriptions": typeof billingErrors;
  }
}
