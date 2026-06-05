/**
 * Dev-only sanity check: warn at startup when seeded connection URIs point
 * at unresolvable hosts.
 *
 * **Why**: a seed-baked URI like `bolt://neoboard-neo4j:7687` works inside
 * the docker-app container's network but not when you later run `npm run dev`
 * on the host. Without this check, the user discovers the problem only when
 * they open the dashboards UI and every widget errors. Better to surface it
 * at startup with a one-line fix.
 *
 * Fires only in `NODE_ENV === "development"`. Fire-and-forget — startup
 * does not wait on this.
 *
 * #899
 */
import { lookup as dnsLookupCallback } from "node:dns";
import { promisify } from "node:util";

const dnsLookup = promisify(dnsLookupCallback);

const PROMPT_HINT =
  "Re-seed from host with: set -a && source app/.env.local && set +a && node scripts/seed-demo.mjs";

interface SeededConnection {
  name: string;
  type: string;
  uri: string;
}

interface VerifyDeps {
  /** Fetch seeded connections. Injectable for tests. */
  fetchConnections: () => Promise<SeededConnection[]>;
  /** Hostname resolver. Injectable for tests. */
  resolve: (host: string) => Promise<unknown>;
  /** Sink for warnings. Injectable for tests. */
  warn: (message: string) => void;
}

/**
 * Extract the hostname from a URI like `bolt://host:7687` or
 * `postgresql://user@host:5432/db`. Returns null on malformed URIs.
 */
export function extractHostname(uri: string): string | null {
  try {
    return new URL(uri).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Core checker — pure aside from the injected deps.
 *
 * Returns the list of unresolvable connections so callers can act / test.
 */
export async function verifyConnectionHostsImpl(
  deps: VerifyDeps,
): Promise<SeededConnection[]> {
  let connections: SeededConnection[];
  try {
    connections = await deps.fetchConnections();
  } catch {
    // DB unreachable, table empty, etc — nothing to verify.
    return [];
  }
  if (connections.length === 0) return [];

  const unresolvable: SeededConnection[] = [];
  await Promise.all(
    connections.map(async (c) => {
      const host = extractHostname(c.uri);
      if (!host) return;
      try {
        await deps.resolve(host);
      } catch {
        unresolvable.push(c);
      }
    }),
  );

  if (unresolvable.length > 0) {
    deps.warn(
      "⚠ " +
        unresolvable.length +
        " seeded connection(s) reference unreachable hosts:\n" +
        unresolvable
          .map((c) => `   - "${c.name}" (${c.type}): ${c.uri}`)
          .join("\n") +
        "\n   Fix: " +
        PROMPT_HINT,
    );
  }
  return unresolvable;
}

/**
 * Default entry-point used by instrumentation. Resolves the real db +
 * crypto deps and runs the check. Guards `NODE_ENV === "development"`
 * itself so the caller doesn't have to.
 *
 * Fire-and-forget.
 */
export async function verifyConnectionHosts(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  try {
    const [{ db }, schema, crypto] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/db/schema"),
      import("@/lib/crypto/crypto"),
    ]);
    await verifyConnectionHostsImpl({
      fetchConnections: async () => {
        const rows = await db
          .select({
            name: schema.connections.name,
            type: schema.connections.type,
            configEncrypted: schema.connections.configEncrypted,
          })
          .from(schema.connections);
        const out: SeededConnection[] = [];
        for (const r of rows) {
          try {
            const config = crypto.decryptJson(r.configEncrypted) as {
              uri?: string;
            };
            if (config.uri) {
              out.push({ name: r.name, type: r.type, uri: config.uri });
            }
          } catch {
            // Skip rows we can't decrypt — env-key mismatch, corrupted blob, etc.
          }
        }
        return out;
      },
      resolve: (host) => dnsLookup(host),
      // Use console.warn (browser-safe + plays nicely with `next dev` output).
      warn: (msg) => {
        console.warn(msg);
      },
    });
  } catch {
    // Never crash startup on a verification failure.
  }
}
