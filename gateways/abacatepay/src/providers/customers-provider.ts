import { Result } from "better-result";
import { detectDocumentType } from "@hyprpay/customers";
import type { BillingResult, Customer, CustomerInput } from "@hyprpay/customers";
import type { z } from "zod";
import type { AbacatePayClient } from "../client/abacatepay-client";
import {
  abacatePayCustomerResponseSchema,
  abacatePayEnvelopeSchema,
} from "../contracts/abacatepay-response-schema";

type AbacatePayCustomerResponse = z.infer<typeof abacatePayCustomerResponseSchema>;

const normalizeDocument = (document: string | undefined, fallback: string) => {
  const candidate = (document ?? fallback).replaceAll(/[.-/\s]/g, "");

  if (candidate.length === 0) {
    return fallback;
  }

  return candidate;
};

const toCustomer = (response: AbacatePayCustomerResponse, input: CustomerInput): Customer => {
  const document = normalizeDocument(response.taxId, input.document);
  const now = new Date().toISOString();

  return {
    // `id` is the local identifier; `providerCustomerId` is AbacatePay's id.
    id: response.id,
    providerCustomerId: response.id,
    name: response.name,
    email: response.email,
    document,
    documentType: detectDocumentType(document),
    phone: response.cellphone ?? input.phone,
    metadata: response.metadata ?? input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
};

export const createCustomer = async (
  client: AbacatePayClient,
  input: CustomerInput,
): Promise<BillingResult<Customer>> => {
  const result = await client.post(
    "customers/create",
    {
      email: input.email,
      name: input.name,
      cellphone: input.phone,
      taxId: input.document,
      metadata: input.metadata,
    },
    abacatePayEnvelopeSchema(abacatePayCustomerResponseSchema),
  );

  if (Result.isError(result)) {
    return Result.err(result.error);
  }

  return Result.ok(toCustomer(result.value.data, input));
};
