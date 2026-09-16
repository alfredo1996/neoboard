"use client";

import { Lock } from "lucide-react";
import { EmptyState, Button } from "@neoboard/components";
import type { FeatureId } from "@/hooks/use-features";
import { DOCS_LINKS } from "@/lib/docs-links";

interface EnterpriseRequiredEmptyStateProps {
  readonly feature: FeatureId;
  /** Override the auto-generated title (defaults to the feature label). */
  readonly title?: string;
  /** Override the auto-generated description. */
  readonly description?: string;
  /** Override the upgrade link target. */
  readonly upgradeUrl?: string;
}

/**
 * Reusable empty state shown when an admin lands on a page that's gated
 * behind an enterprise feature. Used by FeatureGate's `fallback` prop on
 * pages that should still be reachable on community (for upsell), as
 * opposed to those that should be hidden entirely from navigation.
 */
const FEATURE_LABELS: Record<
  FeatureId,
  { title: string; description: string }
> = {
  sso: {
    title: "Single Sign-On",
    description:
      "Configure OIDC providers to let your team sign in with their existing identity provider (Okta, Azure AD, Google Workspace, Keycloak, etc.).",
  },
};

export function EnterpriseRequiredEmptyState({
  feature,
  title,
  description,
  upgradeUrl = DOCS_LINKS.enterprise,
}: EnterpriseRequiredEmptyStateProps) {
  const defaults = FEATURE_LABELS[feature];
  return (
    <EmptyState
      icon={<Lock className="h-8 w-8 text-muted-foreground" />}
      title={title ?? `${defaults.title} is an Enterprise feature`}
      description={description ?? defaults.description}
      action={
        <Button asChild>
          <a href={upgradeUrl} target="_blank" rel="noopener noreferrer">
            Learn about Enterprise
          </a>
        </Button>
      }
    />
  );
}
