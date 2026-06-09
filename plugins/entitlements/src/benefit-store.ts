import type { Benefit } from "./benefit-schema";
import type { EntitlementResult } from "./entitlement-result";

export interface BenefitStore {
  create(benefit: Benefit): Promise<EntitlementResult<Benefit>> | EntitlementResult<Benefit>;
  findById(id: string): Promise<EntitlementResult<Benefit | null>> | EntitlementResult<Benefit | null>;
  listByProduct(productId: string): Promise<EntitlementResult<Benefit[]>> | EntitlementResult<Benefit[]>;
}
