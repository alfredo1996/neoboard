import type { SsoClaimMapping, UserRole } from "@/lib/db/schema";

/**
 * Resolve a NeoBoard role from an OIDC profile using the configured claim mapping.
 *
 * Supports:
 * - Array claims (e.g. `groups: ["neoboard-admins", "users"]`)
 * - String claims (e.g. `role: "admin"`)
 * - Nested claim keys with dot notation (e.g. `realm_access.roles`)
 *
 * Priority: admin > creator > reader. If no match, returns `defaultRole`.
 */
export function resolveRoleFromClaims(
  profile: Record<string, unknown>,
  mapping: SsoClaimMapping | null | undefined,
  defaultRole: UserRole,
): UserRole {
  if (!mapping) return defaultRole;

  const claimValue = getNestedValue(profile, mapping.claimKey);
  if (claimValue === undefined || claimValue === null) return defaultRole;

  const values = normalizeToArray(claimValue);

  // Check in priority order: admin > creator > reader.
  // Each mapping value supports comma-separated lists (e.g. "devops,platform-team")
  // so multiple IdP groups can map to the same NeoBoard role.
  if (mapping.adminValue && matchesAny(values, mapping.adminValue))
    return "admin";
  if (mapping.creatorValue && matchesAny(values, mapping.creatorValue))
    return "creator";
  if (mapping.readerValue && matchesAny(values, mapping.readerValue))
    return "reader";

  return defaultRole;
}

/**
 * Get a potentially nested value from an object using dot notation.
 * e.g. getNestedValue({ realm_access: { roles: ["a"] } }, "realm_access.roles") => ["a"]
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    )
      return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Check if any of the user's claim values matches any of the comma-separated
 * mapping targets. Supports "devops,platform-team,it-ops" syntax.
 */
function matchesAny(claimValues: string[], mappingValue: string): boolean {
  const targets = mappingValue.split(",").map((s) => s.trim());
  return claimValues.some((v) => targets.includes(v));
}

/**
 * Normalize a claim value to a string array for uniform matching.
 */
function normalizeToArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}
