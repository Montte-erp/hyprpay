import { defineErrorCatalog } from "evlog";

export const billingErrors = defineErrorCatalog("hyprpay.refunds", {
  INVALID_INPUT: {
    status: 400,
    message: "Dados de billing inválidos.",
    tags: ["hyprpay", "billing", "refunds"],
  },
  NOT_FOUND: {
    status: 404,
    message: "Recurso de billing não encontrado.",
    tags: ["hyprpay", "billing", "refunds"],
  },
  PROVIDER_REQUEST_FAILED: {
    status: 502,
    message: "Falha ao chamar o provedor de pagamento.",
    tags: ["hyprpay", "billing", "provider", "refunds"],
  },
  PROVIDER_RESPONSE_INVALID: {
    status: 502,
    message: "Resposta inválida do provedor de pagamento.",
    tags: ["hyprpay", "billing", "provider", "refunds"],
  },
  DATABASE_REQUEST_FAILED: {
    status: 500,
    message: "Falha ao persistir dados de billing.",
    tags: ["hyprpay", "billing", "database", "refunds"],
  },
  UNSUPPORTED_CAPABILITY: {
    status: 400,
    message: "O provider não suporta esta operação.",
    tags: ["hyprpay", "billing", "provider", "refunds"],
  },
  PROVIDER_MAPPING_REQUIRED: {
    status: 400,
    message: "O reembolso precisa do identificador do pedido no provider.",
    tags: ["hyprpay", "billing", "provider", "refunds"],
  },
  INVALID_STATE: {
    status: 409,
    message: "O reembolso já foi finalizado e não pode mais mudar de estado.",
    tags: ["hyprpay", "billing", "refunds"],
  },
  INVALID_WEBHOOK_SIGNATURE: {
    status: 401,
    message: "Assinatura do webhook inválida.",
    tags: ["hyprpay", "billing", "webhook", "refunds"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "hyprpay.refunds": typeof billingErrors;
  }
}
