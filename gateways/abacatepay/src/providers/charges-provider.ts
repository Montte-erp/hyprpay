import { Result } from "better-result";
import { BillingError, billingErrors } from "@hyprpay/charges";
import type { BillingResult, Charge, ChargeInput } from "@hyprpay/charges";
import type { AbacatePayClient } from "../client/abacatepay-client";
import {
  abacatePayEnvelopeSchema,
  abacatePayTransparentChargeResponseSchema,
} from "../contracts/abacatepay-response-schema";
import { toChargeStatus } from "../shared/status-mappers";

export const createCharge = async (
  client: AbacatePayClient,
  input: ChargeInput,
): Promise<BillingResult<Charge>> => {
  if (input.method === "card") {
    return Result.err(
      new BillingError({
        error: billingErrors.UNSUPPORTED_CAPABILITY(),
        message: "A AbacatePay não expõe cobrança transparente em cartão neste adapter.",
        provider: "abacatepay",
      }),
    );
  }

  const result = await client.post(
    input.method === "pix" ? "transparents/create" : "transparents/boleto",
    {
      method: input.method === "pix" ? "PIX" : "BOLETO",
      data: {
        amount: input.amount,
        expiresIn: input.expiresInMinutes === undefined ? undefined : input.expiresInMinutes * 60,
        description: input.description,
        metadata: input.metadata,
      },
    },
    abacatePayEnvelopeSchema(abacatePayTransparentChargeResponseSchema),
  );

  if (Result.isError(result)) {
    return Result.err(result.error);
  }

  const data = result.value.data;

  return Result.ok({
    id: data.id,
    providerChargeId: data.id,
    customerId: input.customerId,
    amount: data.amount,
    currency: input.currency,
    method: input.method,
    status: toChargeStatus(data.status),
    description: input.description,
    boleto: input.boleto,
    card: input.card,
    metadata: data.metadata ?? input.metadata ?? {},
    receiptUrl: data.receiptUrl ?? undefined,
    pix:
      input.method === "pix"
        ? {
            qrCodeUrl: data.brCodeBase64,
            copyPaste: data.brCode,
            expiresAt: data.expiresAt,
          }
        : undefined,
    boletoDetails:
      input.method === "boleto"
        ? {
            bankSlipUrl: data.url,
            digitableLine: data.barCode,
            dueDate: input.boleto?.dueDate,
          }
        : undefined,
  });
};
