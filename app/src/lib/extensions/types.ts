/**
 * Typed extension shapes for the four extension points that enterprise
 * features (#37 SSO, #38 custom roles, #107 user groups) will plug into.
 *
 * These types are intentionally abstract — they define the contract only.
 * Concrete implementations live in the enterprise package and are
 * registered at startup via bootstrapExtensions().
 */

import type { UserRole } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Auth providers — used by #37 SSO
// ---------------------------------------------------------------------------

/**
 * An extension that registers a NextAuth provider (SSO: OIDC, SAML, OAuth).
 *
 * The core auth config calls `buildProvider()` at startup to collect
 * all additional providers alongside the built-in Credentials provider.
 *
 * The return type is intentionally `unknown` — importing the NextAuth
 * provider types directly here would couple the core to the auth lib.
 * Enterprise code can cast the return value to the appropriate NextAuth type.
 */
export interface AuthProviderExtension {
  /** Unique id (e.g. "oidc", "saml", "google"). */
  readonly id: string;
  /** Human-readable label for the login page button. */
  readonly label: string;
  /** Factory returning a NextAuth provider config. */
  buildProvider(): unknown;
}

// ---------------------------------------------------------------------------
// Permissions — used by #38 custom roles, #107 user groups
// ---------------------------------------------------------------------------

/**
 * Result of a permission check:
 * - "allow": grant access
 * - "deny": explicit refusal
 * - "continue": no opinion — let later checkers or the default decide
 */
export type PermissionDecision = "allow" | "deny" | "continue";

export interface PermissionContext {
  readonly userId: string;
  readonly role: UserRole;
  readonly tenantId: string;
  readonly resource: string;
  readonly action: string;
  readonly resourceId?: string;
  readonly attributes?: Record<string, unknown>;
}

/**
 * Chain-of-responsibility permission checker. Registered checkers are
 * called in registration order; the first "allow" or "deny" wins. If all
 * checkers return "continue", fall back to the core role-based check.
 */
export interface PermissionExtension {
  readonly id: string;
  check(
    ctx: PermissionContext,
  ): PermissionDecision | Promise<PermissionDecision>;
}

// ---------------------------------------------------------------------------
// Resource filters — used by #107 user groups
// ---------------------------------------------------------------------------

/**
 * Filter a list of resources (dashboards, connections, etc.) based on
 * group membership or other enterprise criteria. Called by list API
 * endpoints after the core tenant filter.
 */
export interface ResourceFilterExtension<TResource = unknown> {
  readonly id: string;
  /** Which resource kind this filter applies to ("dashboard", "connection", ...). */
  readonly resource: string;
  filter(
    items: TResource[],
    ctx: Pick<PermissionContext, "userId" | "role" | "tenantId">,
  ): TResource[] | Promise<TResource[]>;
}

// ---------------------------------------------------------------------------
// Role providers — used by #38 custom roles
// ---------------------------------------------------------------------------

export interface RoleDefinition {
  /** Stable id stored in the DB. */
  readonly id: string;
  /** Human-readable label shown in the admin UI. */
  readonly label: string;
  /** Capability strings that enterprise PermissionExtensions will consume. */
  readonly capabilities: readonly string[];
  readonly description?: string;
}

/**
 * Provide custom role definitions beyond the built-in admin/creator/reader.
 * The core role list is merged with everything returned by registered
 * providers.
 */
export interface RoleProviderExtension {
  readonly id: string;
  getRoles(): readonly RoleDefinition[];
}
