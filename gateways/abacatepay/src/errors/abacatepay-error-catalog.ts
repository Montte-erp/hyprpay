import { defineErrorCatalog } from "evlog";

export const abacatePayErrors = defineErrorCatalog("hyprpay.abacatepay", {
  INVALID_CONFIG: {
    status: 400,
    message: "Configuração da AbacatePay inválida.",
    tags: ["hyprpay", "abacatepay"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "hyprpay.abacatepay": typeof abacatePayErrors;
  }
}
