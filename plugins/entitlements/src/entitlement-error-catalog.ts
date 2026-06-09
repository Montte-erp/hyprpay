import { defineErrorCatalog } from "evlog";

export const entitlementErrors = defineErrorCatalog("hyprpay.entitlements", {
  INVALID_INPUT: {
    status: 400,
    message: "Dados de entitlement inválidos.",
    tags: ["hyprpay", "entitlements"],
  },
  ENTITLEMENT_DENIED: {
    status: 403,
    message: "Cliente não possui acesso a este recurso.",
    tags: ["hyprpay", "entitlements"],
  },
  NOT_FOUND: {
    status: 404,
    message: "Recurso de entitlement não encontrado.",
    tags: ["hyprpay", "entitlements"],
  },
  UNSUPPORTED_CAPABILITY: {
    status: 501,
    message: "Operação de entitlement não suportada pelo armazenamento configurado.",
    tags: ["hyprpay", "entitlements"],
  },
  LICENSE_KEY_INVALID: {
    status: 403,
    message: "Chave de licença inválida.",
    tags: ["hyprpay", "entitlements", "license-key"],
  },
  LICENSE_KEY_REVOKED: {
    status: 403,
    message: "Chave de licença revogada.",
    tags: ["hyprpay", "entitlements", "license-key"],
  },
  LICENSE_KEY_EXPIRED: {
    status: 403,
    message: "Chave de licença expirada.",
    tags: ["hyprpay", "entitlements", "license-key"],
  },
  LICENSE_KEY_ACTIVATION_LIMIT: {
    status: 409,
    message: "Limite de ativações da chave de licença atingido.",
    tags: ["hyprpay", "entitlements", "license-key"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "hyprpay.entitlements": typeof entitlementErrors;
  }
}
