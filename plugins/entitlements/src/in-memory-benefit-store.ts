import { Result } from "better-result";
import type { Benefit } from "./benefit-schema";
import type { BenefitStore } from "./benefit-store";
import type { EntitlementResult } from "./entitlement-result";

export const createInMemoryBenefitStore = (initialBenefits: Benefit[] = []): BenefitStore => {
  const benefits = new Map<string, Benefit>();

  for (const benefit of initialBenefits) {
    benefits.set(benefit.id, benefit);
  }

  return {
    create(benefit: Benefit): EntitlementResult<Benefit> {
      benefits.set(benefit.id, benefit);
      return Result.ok(benefit);
    },
    findById(id: string): EntitlementResult<Benefit | null> {
      return Result.ok(benefits.get(id) ?? null);
    },
    listByProduct(productId: string): EntitlementResult<Benefit[]> {
      const matches = [...benefits.values()].filter(benefit => benefit.productId === productId);
      return Result.ok(matches);
    },
  };
};
