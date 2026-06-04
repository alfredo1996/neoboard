"use client";

import type { ReactNode } from "react";
import { useFeature, type FeatureId } from "@/hooks/use-features";

interface FeatureGateProps {
  readonly feature: FeatureId;
  /** Rendered when the feature is enabled. */
  readonly children: ReactNode;
  /** Rendered when the feature is NOT enabled or still loading. Defaults to nothing. */
  readonly fallback?: ReactNode;
  /**
   * When true, render the fallback during the initial load (recommended for
   * UI that would flash an enterprise-only surface before the features list
   * loads). Default: true.
   */
  readonly hideOnLoading?: boolean;
}

/**
 * Declarative client-side enterprise feature gate.
 *
 * - Reads from `useFeature(feature)` (TanStack Query, 5-min cache)
 * - Renders `children` only when the feature is enabled
 * - Renders `fallback` (default: nothing) when disabled OR still loading
 *
 * For server-side gating, use `requireFeature(feature)` in API route handlers.
 *
 * @example
 * <FeatureGate feature="sso" fallback={<EnterpriseRequiredEmptyState feature="sso" />}>
 *   <SsoProviderManagement />
 * </FeatureGate>
 */
export function FeatureGate({
  feature,
  children,
  fallback = null,
  hideOnLoading = true,
}: FeatureGateProps) {
  const enabled = useFeature(feature);
  if (enabled === undefined) {
    return <>{hideOnLoading ? fallback : null}</>;
  }
  if (!enabled) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
