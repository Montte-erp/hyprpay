export type ResetInterval = "day" | "week" | "month" | "year";
export type PriceInterval = "month" | "year";
export type BenefitType =
  | "feature_flag"
  | "meter_credits"
  | "license_key"
  | "file_download"
  | "github_repository"
  | "discord_role"
  | "slack_channel"
  | "seats"
  | "custom";

export interface MeteredFeatureGrant<TFeatureId extends string = string> {
  readonly featureId: TFeatureId;
  readonly type: "metered";
  readonly limit: number;
  readonly reset: ResetInterval;
}

export interface BooleanFeatureGrant<TFeatureId extends string = string> {
  readonly featureId: TFeatureId;
  readonly type: "boolean";
}

export type FeatureGrant<TFeatureId extends string = string> =
  | BooleanFeatureGrant<TFeatureId>
  | MeteredFeatureGrant<TFeatureId>;

export interface BooleanFeature<TFeatureId extends string = string> {
  readonly id: TFeatureId;
  readonly type: "boolean";
  (): BooleanFeatureGrant<TFeatureId>;
}

export interface MeteredFeature<TFeatureId extends string = string> {
  readonly id: TFeatureId;
  readonly type: "metered";
  readonly reset: ResetInterval;
  (grant: {
    readonly limit: number;
    readonly reset?: ResetInterval;
  }): MeteredFeatureGrant<TFeatureId>;
}

export interface CatalogBenefitBase<
  TBenefitId extends string = string,
  TBenefitType extends BenefitType = BenefitType,
> {
  readonly id: TBenefitId;
  readonly kind: "benefit";
  readonly type: TBenefitType;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface FeatureFlagBenefit<TBenefitId extends string = string> extends CatalogBenefitBase<TBenefitId, "feature_flag"> {
  readonly featureId: string;
}

export interface MeterCreditsBenefit<TBenefitId extends string = string> extends CatalogBenefitBase<TBenefitId, "meter_credits"> {
  readonly meterId: string;
  readonly amount: number;
  readonly reset: ResetInterval;
}

export interface LicenseKeyBenefit<TBenefitId extends string = string> extends CatalogBenefitBase<TBenefitId, "license_key"> {
  readonly prefix?: string;
  readonly limitActivations?: number;
  readonly limitUsage?: number;
  readonly expiresInDays?: number;
}

export interface FileDownloadBenefit<TBenefitId extends string = string> extends CatalogBenefitBase<TBenefitId, "file_download"> {
  readonly fileId: string;
  readonly url?: string;
}

export interface GithubRepositoryBenefit<TBenefitId extends string = string> extends CatalogBenefitBase<TBenefitId, "github_repository"> {
  readonly repository: string;
}

export interface DiscordRoleBenefit<TBenefitId extends string = string> extends CatalogBenefitBase<TBenefitId, "discord_role"> {
  readonly serverId: string;
  readonly roleId?: string;
}

export interface SlackChannelBenefit<TBenefitId extends string = string> extends CatalogBenefitBase<TBenefitId, "slack_channel"> {
  readonly workspaceId: string;
  readonly channelId?: string;
}

export interface SeatsBenefit<TBenefitId extends string = string> extends CatalogBenefitBase<TBenefitId, "seats"> {
  readonly quantity: number;
}

export interface CustomBenefit<TBenefitId extends string = string> extends CatalogBenefitBase<TBenefitId, "custom"> {
  readonly code: string;
}

export type CatalogBenefit<TBenefitId extends string = string> =
  | FeatureFlagBenefit<TBenefitId>
  | MeterCreditsBenefit<TBenefitId>
  | LicenseKeyBenefit<TBenefitId>
  | FileDownloadBenefit<TBenefitId>
  | GithubRepositoryBenefit<TBenefitId>
  | DiscordRoleBenefit<TBenefitId>
  | SlackChannelBenefit<TBenefitId>
  | SeatsBenefit<TBenefitId>
  | CustomBenefit<TBenefitId>;

export type PlanInclude = FeatureGrant | CatalogBenefit;

export interface PlanDefinition<
  TPlanId extends string = string,
  TIncludes extends readonly PlanInclude[] = readonly PlanInclude[],
> {
  readonly id: TPlanId;
  readonly name?: string;
  readonly group?: string;
  readonly default?: true;
  readonly price?: {
    readonly amountMinor: number;
    readonly currency: "BRL";
    readonly interval: PriceInterval;
  };
  readonly includes: TIncludes;
}

export interface ProductDefinition<
  TProductId extends string = string,
  TPlans extends readonly PlanDefinition[] = readonly PlanDefinition[],
> {
  readonly id: TProductId;
  readonly name: string;
  readonly plans: TPlans;
}

type ExtractFeatureId<TInclude> = TInclude extends { readonly featureId: infer TFeatureId extends string }
  ? TFeatureId
  : never;

type ExtractBenefitId<TInclude> = TInclude extends { readonly kind: "benefit"; readonly id: infer TBenefitId extends string }
  ? TBenefitId
  : never;

export type PlanIdFromCatalog<TCatalog extends readonly ProductDefinition[]> = TCatalog[number]["plans"][number]["id"];
export type FeatureIdFromCatalog<TCatalog extends readonly ProductDefinition[]> = ExtractFeatureId<
  TCatalog[number]["plans"][number]["includes"][number]
>;
export type BenefitIdFromCatalog<TCatalog extends readonly ProductDefinition[]> = ExtractBenefitId<
  TCatalog[number]["plans"][number]["includes"][number]
>;

const createBooleanFeature = <const TFeatureId extends string>(input: {
  readonly id: TFeatureId;
}): BooleanFeature<TFeatureId> => {
  const type: "boolean" = "boolean";
  const grant = () => ({
    featureId: input.id,
    type,
  });

  return Object.assign(grant, {
    id: input.id,
    type,
  });
};

const createMeteredFeature = <const TFeatureId extends string>(input: {
  readonly id: TFeatureId;
  readonly reset?: ResetInterval;
}): MeteredFeature<TFeatureId> => {
  const type: "metered" = "metered";
  const grant = (featureGrant: {
    readonly limit: number;
    readonly reset?: ResetInterval;
  }) => ({
    featureId: input.id,
    type,
    limit: featureGrant.limit,
    reset: featureGrant.reset ?? input.reset ?? "month",
  });

  return Object.assign(grant, {
    id: input.id,
    type,
    reset: input.reset ?? "month",
  });
};

const benefitBase = <const TBenefitId extends string, const TBenefitType extends BenefitType>(
  input: CatalogBenefitBase<TBenefitId, TBenefitType>,
): CatalogBenefitBase<TBenefitId, TBenefitType> => ({
  id: input.id,
  kind: "benefit",
  type: input.type,
  ...(input.name === undefined ? {} : { name: input.name }),
  ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
});

const featureFlagBenefit = <const TBenefitId extends string>(input: {
  readonly id: TBenefitId;
  readonly featureId: string;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): FeatureFlagBenefit<TBenefitId> => ({
  ...benefitBase({ ...input, kind: "benefit", type: "feature_flag" }),
  featureId: input.featureId,
});

const meterCreditsBenefit = <const TBenefitId extends string>(input: {
  readonly id: TBenefitId;
  readonly meterId: string;
  readonly amount: number;
  readonly reset?: ResetInterval;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): MeterCreditsBenefit<TBenefitId> => ({
  ...benefitBase({ ...input, kind: "benefit", type: "meter_credits" }),
  meterId: input.meterId,
  amount: input.amount,
  reset: input.reset ?? "month",
});

const licenseKeyBenefit = <const TBenefitId extends string>(input: {
  readonly id: TBenefitId;
  readonly prefix?: string;
  readonly limitActivations?: number;
  readonly limitUsage?: number;
  readonly expiresInDays?: number;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): LicenseKeyBenefit<TBenefitId> => ({
  ...benefitBase({ ...input, kind: "benefit", type: "license_key" }),
  ...(input.prefix === undefined ? {} : { prefix: input.prefix }),
  ...(input.limitActivations === undefined ? {} : { limitActivations: input.limitActivations }),
  ...(input.limitUsage === undefined ? {} : { limitUsage: input.limitUsage }),
  ...(input.expiresInDays === undefined ? {} : { expiresInDays: input.expiresInDays }),
});

const fileDownloadBenefit = <const TBenefitId extends string>(input: {
  readonly id: TBenefitId;
  readonly fileId: string;
  readonly url?: string;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): FileDownloadBenefit<TBenefitId> => ({
  ...benefitBase({ ...input, kind: "benefit", type: "file_download" }),
  fileId: input.fileId,
  ...(input.url === undefined ? {} : { url: input.url }),
});

const githubRepositoryBenefit = <const TBenefitId extends string>(input: {
  readonly id: TBenefitId;
  readonly repository: string;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): GithubRepositoryBenefit<TBenefitId> => ({
  ...benefitBase({ ...input, kind: "benefit", type: "github_repository" }),
  repository: input.repository,
});

const discordRoleBenefit = <const TBenefitId extends string>(input: {
  readonly id: TBenefitId;
  readonly serverId: string;
  readonly roleId?: string;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): DiscordRoleBenefit<TBenefitId> => ({
  ...benefitBase({ ...input, kind: "benefit", type: "discord_role" }),
  serverId: input.serverId,
  ...(input.roleId === undefined ? {} : { roleId: input.roleId }),
});

const slackChannelBenefit = <const TBenefitId extends string>(input: {
  readonly id: TBenefitId;
  readonly workspaceId: string;
  readonly channelId?: string;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): SlackChannelBenefit<TBenefitId> => ({
  ...benefitBase({ ...input, kind: "benefit", type: "slack_channel" }),
  workspaceId: input.workspaceId,
  ...(input.channelId === undefined ? {} : { channelId: input.channelId }),
});

const seatsBenefit = <const TBenefitId extends string>(input: {
  readonly id: TBenefitId;
  readonly quantity: number;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): SeatsBenefit<TBenefitId> => ({
  ...benefitBase({ ...input, kind: "benefit", type: "seats" }),
  quantity: input.quantity,
});

const customBenefit = <const TBenefitId extends string>(input: {
  readonly id: TBenefitId;
  readonly code: string;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): CustomBenefit<TBenefitId> => ({
  ...benefitBase({ ...input, kind: "benefit", type: "custom" }),
  code: input.code,
});

export const feature = {
  boolean: createBooleanFeature,
  metered: createMeteredFeature,
};

export const benefit = {
  featureFlag: featureFlagBenefit,
  meterCredits: meterCreditsBenefit,
  licenseKey: licenseKeyBenefit,
  fileDownload: fileDownloadBenefit,
  githubRepository: githubRepositoryBenefit,
  discordRole: discordRoleBenefit,
  slackChannel: slackChannelBenefit,
  seats: seatsBenefit,
  custom: customBenefit,
};

export const plan = <const TPlanId extends string, const TIncludes extends readonly PlanInclude[]>(
  definition: PlanDefinition<TPlanId, TIncludes>,
): PlanDefinition<TPlanId, TIncludes> => definition;

export const product = <const TProductId extends string, const TPlans extends readonly PlanDefinition[]>(
  definition: ProductDefinition<TProductId, TPlans>,
): ProductDefinition<TProductId, TPlans> => definition;
