import { loadSsoProviders } from "./provider-loader";
import { loadEnvSsoProvider } from "./env-provider";
import type { LoadedSsoProvider } from "./provider-loader";

const CACHE_TTL_MS = 60_000; // 1 minute

interface CacheEntry {
  providers: LoadedSsoProvider[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Load SSO providers for a tenant with in-memory caching (60s TTL).
 * Merges the env-based provider (if configured) with DB-based providers.
 * Env provider comes first so it appears as the primary SSO button.
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

  const envProvider = loadEnvSsoProvider();

  let dbProviders: LoadedSsoProvider[] = [];
  let dbFailed = false;
  try {
    dbProviders = await loadSsoProviders(tenantId);
  } catch {
    // DB unavailable — env provider may still work, but don't cache this result
    dbFailed = true;
  }

  const providers = envProvider ? [envProvider, ...dbProviders] : dbProviders;
  // Only cache when the DB query succeeded — caching a fallback result
  // would extend the outage window by the full TTL after DB recovery.
  if (!dbFailed) {
    cache.set(tenantId, { providers, expiresAt: now + CACHE_TTL_MS });
  }
  return providers;
}

/**
 * Clear the cached providers for a tenant. Called when an admin
 * adds/removes/updates an SSO provider so changes take effect immediately.
 */
export function invalidateProviderCache(tenantId: string): void {
  cache.delete(tenantId);
}
