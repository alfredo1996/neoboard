/**
 * Feature registry — edition-based enterprise feature gating.
 *
 * NeoBoard uses a trust-based edition model (like Mattermost, Grafana OSS,
 * MinIO). Setting NEOBOARD_EDITION=enterprise unlocks all enterprise features;
 * operators accept the commercial license agreement by flipping the env var.
 * There is no cryptographic license key — enforcement is honour-based.
 */

// Only the features that exist. Ten more ids were listed here with no code
// behind them, so enterprise mode advertised features nobody had built
// (#1845). Add an id back the release it ships in.
export type FeatureId = "sso";

export type Edition = "community" | "enterprise";

const ENTERPRISE_FEATURES: readonly FeatureId[] = ["sso"] as const;

export function getEdition(): Edition {
  const raw = process.env.NEOBOARD_EDITION?.toLowerCase();
  return raw === "enterprise" ? "enterprise" : "community";
}

export function isEnterpriseEdition(): boolean {
  return getEdition() === "enterprise";
}

export function hasFeature(id: FeatureId): boolean {
  if (!isEnterpriseEdition()) return false;
  return ENTERPRISE_FEATURES.includes(id);
}

export function getEnabledFeatures(): FeatureId[] {
  return isEnterpriseEdition() ? [...ENTERPRISE_FEATURES] : [];
}
