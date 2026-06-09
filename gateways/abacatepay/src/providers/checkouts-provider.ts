import { Result } from "better-result";
import type { BillingResult, Checkout, CheckoutInput } from "@hyprpay/checkouts";
import type { AbacatePayClient } from "../client/abacatepay-client";
import {
  abacatePayBillingResponseSchema,
  abacatePayEnvelopeSchema,
} from "../contracts/abacatepay-response-schema";
import { toCheckoutStatus } from "../shared/status-mappers";

type CheckoutProviderInput = CheckoutInput & { providerProductId: string };

const toMethods = (methods: CheckoutInput["methods"]) =>
  methods.map((method: CheckoutInput["methods"][number]) => {
    if (method === "pix") {
      return "PIX";
    }

    if (method === "boleto") {
      return "BOLETO";
    }

    return "CARD";
  });

export const createCheckout = async (
  client: AbacatePayClient,
  input: CheckoutProviderInput,
): Promise<BillingResult<Checkout>> => {
  const result = await client.post(
    "checkouts/create",
    {
      items: [{ id: input.providerProductId, quantity: 1 }],
      customerId: input.customerId,
      returnUrl: input.cancelUrl,
      completionUrl: input.successUrl,
      methods: toMethods(input.methods),
      metadata: input.metadata,
    },
    abacatePayEnvelopeSchema(abacatePayBillingResponseSchema),
  );

  if (Result.isError(result)) {
    return Result.err(result.error);
  }

  const data = result.value.data;

  return Result.ok({
    id: data.id,
    providerCheckoutId: data.id,
    customerId: data.customerId ?? input.customerId,
    priceId: input.priceId,
    providerProductId: input.providerProductId,
    methods: input.methods,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    metadata: input.metadata ?? {},
    url: data.url,
    amount: data.amount,
    currency: "BRL",
    status: toCheckoutStatus(data.status),
    discountAmount: 0,
  });
};
