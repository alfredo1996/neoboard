import { loadSsoProviders } from "./provider-loader";
import type { LoadedSsoProvider } from "./provider-loader";

const CACHE_TTL_MS = 60_000; // 1 minute

interface CacheEntry {
  providers: LoadedSsoProvider[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Load SSO providers for a tenant with in-memory caching (60s TTL).
 * Falls back to empty array if the DB query fails.
 */
export async function getCachedSsoProviders(
  tenantId: string,
): Promise<LoadedSsoProvider[]> {
  const now = Date.now();
  const cached = cache.get(tenantId);

  if (cached && cached.expiresAt > now) {
    return cached.providers;
  }

  try {
    const providers = await loadSsoProviders(tenantId);
    cache.set(tenantId, { providers, expiresAt: now + CACHE_TTL_MS });
    return providers;
  } catch {
    return [];
  }
}

/**
 * Clear the cached providers for a tenant. Called when an admin
 * adds/removes/updates an SSO provider so changes take effect immediately.
 */
export function invalidateProviderCache(tenantId: string): void {
  cache.delete(tenantId);
}
