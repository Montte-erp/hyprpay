import { Result } from "better-result";
import { entitlementErrors } from "./entitlement-error-catalog";
import { EntitlementError } from "./entitlement-errors";
import type { EntitlementResult } from "./entitlement-result";
import type { LicenseKeyStore } from "./license-key-store";
import {
  type LicenseKey,
  type LicenseKeyActivateInput,
  type LicenseKeyIssueInput,
  type LicenseKeyRevokeInput,
  type LicenseKeyValidateInput,
  type LicenseKeyValidation,
  licenseKeyActivateInputSchema,
  licenseKeyIssueInputSchema,
  licenseKeyRevokeInputSchema,
  licenseKeyValidateInputSchema,
} from "./license-key-schema";

const KEY_GROUPS = 4;
const BYTES_PER_GROUP = 4;
// Crockford-ish base32 alphabet (no ambiguous chars) for human-readable keys.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";

const invalidInput = <T>(message = "Dados de licença inválidos."): EntitlementResult<T> =>
  Result.err(
    new EntitlementError({
      error: entitlementErrors.INVALID_INPUT(),
      message,
    }),
  );

const notFound = <T>(): EntitlementResult<T> =>
  Result.err(
    new EntitlementError({
      error: entitlementErrors.LICENSE_KEY_INVALID(),
      message: "Chave de licença não encontrada.",
    }),
  );

const revoked = <T>(): EntitlementResult<T> =>
  Result.err(
    new EntitlementError({
      error: entitlementErrors.LICENSE_KEY_REVOKED(),
      message: "Chave de licença revogada.",
    }),
  );

const expired = <T>(): EntitlementResult<T> =>
  Result.err(
    new EntitlementError({
      error: entitlementErrors.LICENSE_KEY_EXPIRED(),
      message: "Chave de licença expirada.",
    }),
  );

const activationLimitReached = <T>(): EntitlementResult<T> =>
  Result.err(
    new EntitlementError({
      error: entitlementErrors.LICENSE_KEY_ACTIVATION_LIMIT(),
      message: "Limite de ativações da chave de licença atingido.",
    }),
  );

/**
 * Generates cryptographically-random license key material. Format:
 * `XXXX-XXXX-XXXX-XXXX` drawn from an unambiguous base32 alphabet using
 * `crypto.getRandomValues` — never a counter or `Math.random`.
 */
export const generateLicenseKeyMaterial = (): string => {
  const groups: string[] = [];

  for (let group = 0; group < KEY_GROUPS; group += 1) {
    const bytes = new Uint8Array(BYTES_PER_GROUP);
    crypto.getRandomValues(bytes);

    let chunk = "";
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index] ?? 0;
      chunk += ALPHABET[byte % ALPHABET.length] ?? "0";
    }

    groups.push(chunk);
  }

  return groups.join("-");
};

const isExpired = (licenseKey: LicenseKey, now: number): boolean =>
  licenseKey.expiresAt !== undefined && Date.parse(licenseKey.expiresAt) <= now;

const toValidation = (licenseKey: LicenseKey): LicenseKeyValidation => ({
  valid: licenseKey.status === "active",
  key: licenseKey.key,
  status: licenseKey.status,
  ...(licenseKey.activationLimit === undefined ? {} : { activationLimit: licenseKey.activationLimit }),
  activationCount: licenseKey.activationCount,
  ...(licenseKey.activationLimit === undefined
    ? {}
    : { remainingActivations: Math.max(0, licenseKey.activationLimit - licenseKey.activationCount) }),
  ...(licenseKey.expiresAt === undefined ? {} : { expiresAt: licenseKey.expiresAt }),
});

export interface LicenseKeyService {
  issue(input: LicenseKeyIssueInput): Promise<EntitlementResult<LicenseKey>>;
  validate(input: LicenseKeyValidateInput): Promise<EntitlementResult<LicenseKeyValidation>>;
  activate(input: LicenseKeyActivateInput): Promise<EntitlementResult<LicenseKey>>;
  revoke(input: LicenseKeyRevokeInput): Promise<EntitlementResult<LicenseKey>>;
}

export const createLicenseKeyService = (store: LicenseKeyStore): LicenseKeyService => ({
  issue: async (input: LicenseKeyIssueInput) => {
    const parsed = licenseKeyIssueInputSchema.safeParse(input);

    if (!parsed.success) {
      return invalidInput();
    }

    const licenseKey: LicenseKey = {
      id: crypto.randomUUID(),
      key: generateLicenseKeyMaterial(),
      benefitId: parsed.data.benefitId,
      customerId: parsed.data.customerId,
      status: "active",
      activationCount: 0,
      createdAt: new Date().toISOString(),
      ...(parsed.data.activationLimit === undefined
        ? {}
        : { activationLimit: parsed.data.activationLimit }),
      ...(parsed.data.expiresAt === undefined ? {} : { expiresAt: parsed.data.expiresAt }),
      ...(parsed.data.metadata === undefined ? {} : { metadata: parsed.data.metadata }),
    };

    return store.create(licenseKey);
  },
  validate: async (input: LicenseKeyValidateInput) => {
    const parsed = licenseKeyValidateInputSchema.safeParse(input);

    if (!parsed.success) {
      return invalidInput();
    }

    const lookup = await store.findByKey(parsed.data.key);

    if (Result.isError(lookup)) {
      return Result.err(lookup.error);
    }

    if (lookup.value === null) {
      return notFound();
    }

    const licenseKey = lookup.value;

    if (licenseKey.status === "active" && isExpired(licenseKey, Date.now())) {
      const updated: LicenseKey = { ...licenseKey, status: "expired" };
      const persisted = await store.update(updated);

      if (Result.isError(persisted)) {
        return Result.err(persisted.error);
      }

      return Result.ok(toValidation(persisted.value));
    }

    return Result.ok(toValidation(licenseKey));
  },
  activate: async (input: LicenseKeyActivateInput) => {
    const parsed = licenseKeyActivateInputSchema.safeParse(input);

    if (!parsed.success) {
      return invalidInput();
    }

    const lookup = await store.findByKey(parsed.data.key);

    if (Result.isError(lookup)) {
      return Result.err(lookup.error);
    }

    if (lookup.value === null) {
      return notFound();
    }

    const licenseKey = lookup.value;

    if (licenseKey.status === "revoked") {
      return revoked();
    }

    if (licenseKey.status === "expired" || isExpired(licenseKey, Date.now())) {
      return expired();
    }

    if (
      licenseKey.activationLimit !== undefined &&
      licenseKey.activationCount >= licenseKey.activationLimit
    ) {
      return activationLimitReached();
    }

    const updated: LicenseKey = {
      ...licenseKey,
      activationCount: licenseKey.activationCount + 1,
    };

    return store.update(updated);
  },
  revoke: async (input: LicenseKeyRevokeInput) => {
    const parsed = licenseKeyRevokeInputSchema.safeParse(input);

    if (!parsed.success) {
      return invalidInput();
    }

    const lookup = await store.findByKey(parsed.data.key);

    if (Result.isError(lookup)) {
      return Result.err(lookup.error);
    }

    if (lookup.value === null) {
      return notFound();
    }

    const updated: LicenseKey = {
      ...lookup.value,
      status: "revoked",
      revokedAt: new Date().toISOString(),
    };

    return store.update(updated);
  },
});
