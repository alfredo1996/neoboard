/**
 * Whether TENANT_ID holds a non-blank value. Unset, "" and whitespace-only all
 * count as unset: the pre-1.5 prod compose files passed `TENANT_ID: ""` (#1728).
 */
export function isTenantIdSet(): boolean {
  return Boolean(process.env.TENANT_ID?.trim());
}

/**
 * The tenant this process serves: TENANT_ID as given, or "default" when it is
 * unset or blank. The only reader of TENANT_ID — a guard test fails on any
 * other, because resolvers that disagree put users in one tenant and look them
 * up in another.
 */
export function resolveTenantId(): string {
  const value = process.env.TENANT_ID;
  return value?.trim() ? value : "default";
}
