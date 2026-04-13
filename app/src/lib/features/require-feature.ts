import type { FeatureId } from "./registry";
import { hasFeature } from "./registry";

/**
 * Thrown when an API route requires an enterprise feature that is not
 * enabled in the current edition. Mapped to an ENTERPRISE_REQUIRED (402)
 * response by handleRouteError.
 */
export class EnterpriseRequiredError extends Error {
  readonly feature: FeatureId;

  constructor(feature: FeatureId) {
    super(`${feature} requires an enterprise license`);
    this.name = "EnterpriseRequiredError";
    this.feature = feature;
  }
}

/**
 * Route guard — call at the start of an API handler to gate enterprise
 * features. Throws EnterpriseRequiredError if the feature is not enabled.
 */
export function requireFeature(feature: FeatureId): void {
  if (!hasFeature(feature)) {
    throw new EnterpriseRequiredError(feature);
  }
}
