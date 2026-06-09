import { Result } from "better-result";
import type { BillingResult, Product, ProviderProductInput } from "@hyprpay/catalog";
import type { AbacatePayClient } from "../client/abacatepay-client";
import {
  abacatePayEnvelopeSchema,
  abacatePayProductResponseSchema,
} from "../contracts/abacatepay-response-schema";
import { toCycle } from "../shared/status-mappers";

export const createProduct = async (
  client: AbacatePayClient,
  input: ProviderProductInput,
): Promise<BillingResult<Product>> => {
  const result = await client.post(
    "products/create",
    {
      externalId: input.externalId,
      name: input.name,
      price: input.amount,
      currency: input.currency,
      description: input.description,
      cycle: toCycle(input.interval),
      trialDays: input.trialDays,
    },
    abacatePayEnvelopeSchema(abacatePayProductResponseSchema),
  );

  if (Result.isError(result)) {
    return Result.err(result.error);
  }

  return Result.ok({
    id: result.value.data.id,
    slug: input.externalId,
    name: result.value.data.name,
    description: result.value.data.description,
    metadata: input.metadata ?? {},
    active: result.value.data.status !== "INACTIVE",
  });
};
