import type {
  CatalogBenefit,
  FeatureGrant,
  PlanDefinition,
  PlanInclude,
  ProductDefinition,
} from "../catalog";

export const isFeatureGrant = (include: PlanInclude): include is FeatureGrant => "featureId" in include;
export const isBenefit = (include: PlanInclude): include is CatalogBenefit => "kind" in include && include.kind === "benefit";

export const findPlan = (catalog: readonly ProductDefinition[], planId: string): PlanDefinition | null => {
  for (const item of catalog) {
    for (const catalogPlan of item.plans) {
      if (catalogPlan.id === planId) {
        return catalogPlan;
      }
    }
  }

  return null;
};
export const findPlanGrant = (
  catalog: readonly ProductDefinition[],
  planId: string,
  featureId: string,
): FeatureGrant | null => {
  const selectedPlan = findPlan(catalog, planId);

  if (selectedPlan === null) {
    return null;
  }

  for (const grant of selectedPlan.includes) {
    if (isFeatureGrant(grant) && grant.featureId === featureId) {
      return grant;
    }
  }

  return null;
};


export const findBenefit = (catalog: readonly ProductDefinition[], benefitId: string): CatalogBenefit | null => {
  for (const item of catalog) {
    for (const catalogPlan of item.plans) {
      for (const include of catalogPlan.includes) {
        if (isBenefit(include) && include.id === benefitId) {
          return include;
        }
      }
    }
  }

  return null;
};

export const findDefaultGrant = (catalog: readonly ProductDefinition[], featureId: string): FeatureGrant | null => {
  for (const item of catalog) {
    for (const catalogPlan of item.plans) {
      if (catalogPlan.default !== true) {
        continue;
      }

      for (const grant of catalogPlan.includes) {
        if (isFeatureGrant(grant) && grant.featureId === featureId) {
          return grant;
        }
      }
    }
  }

  return null;
};
