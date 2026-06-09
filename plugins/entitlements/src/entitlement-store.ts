import type {
  EntitlementCheck,
  EntitlementCheckInput,
  EntitlementConsumeInput,
  EntitlementGrant,
  EntitlementRevokeInput,
} from "./entitlement-schema";
import type { EntitlementResult } from "./entitlement-result";

export interface EntitlementStore {
  grant(input: EntitlementGrant): Promise<EntitlementResult<EntitlementCheck>> | EntitlementResult<EntitlementCheck>;
  check(input: EntitlementCheckInput): Promise<EntitlementResult<EntitlementCheck>> | EntitlementResult<EntitlementCheck>;
  consume(
    input: EntitlementConsumeInput,
  ): Promise<EntitlementResult<EntitlementCheck>> | EntitlementResult<EntitlementCheck>;
  /**
   * Revokes a customer's access to a feature. Optional so existing persistence
   * adapters (e.g. the Drizzle store, owned by another lane) stay valid without
   * an immediate migration; the plugin reports UNSUPPORTED when a store omits it.
   */
  revoke?(
    input: EntitlementRevokeInput,
  ): Promise<EntitlementResult<EntitlementCheck>> | EntitlementResult<EntitlementCheck>;
}
