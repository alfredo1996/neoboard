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

  // Check in priority order: admin > creator > reader
  if (mapping.adminValue && values.includes(mapping.adminValue)) return "admin";
  if (mapping.creatorValue && values.includes(mapping.creatorValue))
    return "creator";
  if (mapping.readerValue && values.includes(mapping.readerValue))
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
 * Normalize a claim value to a string array for uniform matching.
 */
function normalizeToArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}
