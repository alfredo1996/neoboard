/**
 * The product release this binary belongs to, and where its image lives (#1314).
 *
 * `__NEOBOARD_VERSION__` is substituted by scripts/build-sea.mjs when it
 * bundles the single-file binary, so a binary built from tag v1.9.2 pins
 * ghcr.io/alfredo1996/neoboard:1.9.2. Unbundled (npm, tests, a checkout) it is
 * undefined: the CLI's own package version is NOT the product's (they release
 * on separate tags, #1876), so there is nothing honest to fall back to.
 */
declare const __NEOBOARD_VERSION__: string | undefined;

export const BUILT_IN_VERSION: string | null =
  typeof __NEOBOARD_VERSION__ === "string" ? __NEOBOARD_VERSION__ : null;

export const IMAGE_REPO = "ghcr.io/alfredo1996/neoboard";

/** Plain or pre-release semver. Anything else would not be a tag we published. */
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

/** NEOBOARD_VERSION, validated: it is written into a .env file. */
export function requestedVersion(): string | null {
  const v = process.env.NEOBOARD_VERSION;
  if (!v) return null;
  if (!VERSION_RE.test(v)) {
    throw new Error(
      `NEOBOARD_VERSION must look like 1.9.2 (got ${JSON.stringify(v)}).`,
    );
  }
  return v;
}
