export interface HyprPayCapabilities {
  readonly customers: true;
  readonly checkouts: true;
  readonly subscriptions: true;
  readonly refunds: true;
  readonly webhooks: true;
  readonly benefits: true;
  readonly entitlements: true;
  readonly meters: true;
  readonly licenseKeys: true;
  readonly downloads: true;
  readonly seats: true;
  readonly customerPortal: true;
}

export const hyprPayCapabilities: HyprPayCapabilities = {
  customers: true,
  checkouts: true,
  subscriptions: true,
  refunds: true,
  webhooks: true,
  benefits: true,
  entitlements: true,
  meters: true,
  licenseKeys: true,
  downloads: true,
  seats: true,
  customerPortal: true,
};
