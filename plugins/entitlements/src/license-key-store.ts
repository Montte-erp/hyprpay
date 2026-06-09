import type { LicenseKey } from "./license-key-schema";
import type { EntitlementResult } from "./entitlement-result";

export interface LicenseKeyStore {
  create(licenseKey: LicenseKey): Promise<EntitlementResult<LicenseKey>> | EntitlementResult<LicenseKey>;
  findByKey(key: string): Promise<EntitlementResult<LicenseKey | null>> | EntitlementResult<LicenseKey | null>;
  update(licenseKey: LicenseKey): Promise<EntitlementResult<LicenseKey>> | EntitlementResult<LicenseKey>;
  listByCustomer(
    customerId: string,
  ): Promise<EntitlementResult<LicenseKey[]>> | EntitlementResult<LicenseKey[]>;
}
