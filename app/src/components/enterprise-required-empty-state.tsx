"use client";

import { Lock } from "lucide-react";
import { EmptyState, Button } from "@neoboard/components";
import type { FeatureId } from "@/hooks/use-features";

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
  "custom-roles": {
    title: "Custom Roles",
    description:
      "Define roles beyond admin/creator/reader with fine-grained permissions.",
  },
  "user-groups": {
    title: "User Groups",
    description: "Organise users into groups and assign permissions by group.",
  },
  "connector-labels": {
    title: "Connector Labels",
    description: "Tag and filter database connections with custom labels.",
  },
  "connector-alias": {
    title: "Connector Alias",
    description:
      "Define environment-specific aliases for the same logical connector.",
  },
  "environment-selector": {
    title: "Environment Selector",
    description:
      "Switch dashboards between staging / production data sources without rebuilding.",
  },
  "bulk-import": {
    title: "Bulk Import",
    description: "Import dashboards, users, and connections from CSV or JSON.",
  },
  "dashboard-sharing-links": {
    title: "Dashboard Sharing Links",
    description: "Generate signed, expiring share links for external viewers.",
  },
  impersonation: {
    title: "User Impersonation",
    description: "Sign in as another user for support and troubleshooting.",
  },
  "session-management": {
    title: "Session Management",
    description: "View and revoke active sessions across your tenant.",
  },
  "ast-completion": {
    title: "AST-Based Query Completion",
    description:
      "Smarter Cypher/SQL completion powered by schema-aware AST parsing.",
  },
};

export function EnterpriseRequiredEmptyState({
  feature,
  title,
  description,
  upgradeUrl = "https://neoboard.app/enterprise",
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
