"use client";

import { useQuery } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api/api-client";

export type Edition = "community" | "enterprise";

export type FeatureId =
  | "sso"
  | "custom-roles"
  | "user-groups"
  | "connector-labels"
  | "connector-alias"
  | "environment-selector"
  | "bulk-import"
  | "dashboard-sharing-links"
  | "impersonation"
  | "session-management"
  | "ast-completion";

export interface FeaturesResponse {
  edition: Edition;
  features: FeatureId[];
}

/**
 * Reads the current edition + enabled feature list from `/api/features`.
 *
 * Backed by TanStack Query with a 5-minute staleTime. Edition is an
 * honour-based env flag (`NEOBOARD_EDITION`) — operators flip it server-
 * side, restart, and the next request reflects the new value. A 5-minute
 * client cache is acceptable for this cadence; if you need an immediate
 * reaction to a flip, invalidate the `["features"]` query.
 */
export function useFeatures() {
  return useQuery<FeaturesResponse>({
    queryKey: ["features"],
    queryFn: async () => {
      const res = await fetch("/api/features");
      return unwrapResponse<FeaturesResponse>(res);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Convenience: `useFeature("sso")` returns `true | false | undefined`.
 *
 * `undefined` means the features list hasn't loaded yet — callers
 * should treat it the same as "feature absent" for gating UX (don't
 * flash enterprise UI during the initial load).
 */
export function useFeature(id: FeatureId): boolean | undefined {
  const { data } = useFeatures();
  if (!data) return undefined;
  return data.features.includes(id);
}
