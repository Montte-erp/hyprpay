import { Result } from "better-result";
import type { LicenseKey } from "./license-key-schema";
import type { LicenseKeyStore } from "./license-key-store";
import type { EntitlementResult } from "./entitlement-result";

export const createInMemoryLicenseKeyStore = (
  initialKeys: LicenseKey[] = [],
): LicenseKeyStore => {
  const keys = new Map<string, LicenseKey>();

  for (const licenseKey of initialKeys) {
    keys.set(licenseKey.key, licenseKey);
  }

  return {
    create(licenseKey: LicenseKey): EntitlementResult<LicenseKey> {
      keys.set(licenseKey.key, licenseKey);
      return Result.ok(licenseKey);
    },
    findByKey(key: string): EntitlementResult<LicenseKey | null> {
      return Result.ok(keys.get(key) ?? null);
    },
    update(licenseKey: LicenseKey): EntitlementResult<LicenseKey> {
      keys.set(licenseKey.key, licenseKey);
      return Result.ok(licenseKey);
    },
    listByCustomer(customerId: string): EntitlementResult<LicenseKey[]> {
      const matches = [...keys.values()].filter(licenseKey => licenseKey.customerId === customerId);
      return Result.ok(matches);
    },
  };
};
