import { defineErrorCatalog } from "evlog";

export const drizzleErrors = defineErrorCatalog("hyprpay.drizzle", {
  QUERY_FAILED: {
    status: 500,
    message: "Falha ao executar operação de billing no banco.",
    tags: ["hyprpay", "drizzle", "database"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "hyprpay.drizzle": typeof drizzleErrors;
  }
}
