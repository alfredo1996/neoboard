import { getEdition, isEnterpriseEdition } from "@/lib/features/registry";
import type { Extensions } from "./index";

/**
 * Summary returned by `bootstrapExtensions()` — useful for startup logging
 * and for tests that want to assert the bootstrap outcome without inspecting
 * the registries directly.
 */
export interface BootstrapResult {
  readonly edition: "community" | "enterprise";
  readonly enterpriseLoaded: boolean;
  readonly errors: readonly string[];
}

/**
 * Shape that the enterprise package exports. Defined here so core can
 * type-check the interaction without importing the enterprise package
 * (which may not exist in community builds).
 */
export interface EnterpriseModule {
  register(extensions: Extensions): void;
}

/**
 * Loader function signature — returns the enterprise module or null if
 * unavailable. Extracted so tests can inject a stub without touching
 * the real dynamic import path.
 */
export type EnterpriseLoader = () => Promise<EnterpriseModule | null>;

/** Default loader — dynamic-imports the real enterprise package. */
const defaultEnterpriseLoader: EnterpriseLoader = async () => {
  // Dynamic import isolates the enterprise package so community builds
  // do not pay any cost for enterprise code.
  const pkg = "@neoboard/enterprise";
  try {
    const mod = (await import(
      /* @vite-ignore */ pkg
    )) as Partial<EnterpriseModule>;
    return mod?.register ? (mod as EnterpriseModule) : null;
  } catch {
    return null;
  }
};

let bootstrapped = false;

/**
 * Initialize the extension system. Called once at app startup.
 *
 * In community edition this is a no-op. In enterprise edition it invokes
 * the loader (by default, dynamically imports `@neoboard/enterprise`) and
 * calls its `register()`. If the package is not installed the bootstrap
 * reports `enterpriseLoaded: false` but does NOT throw.
 *
 * Idempotent — calling twice has no additional effect.
 *
 * The `loader` parameter exists for tests — production code should not
 * pass it.
 */
export async function bootstrapExtensions(
  loader: EnterpriseLoader = defaultEnterpriseLoader,
): Promise<BootstrapResult> {
  if (bootstrapped) {
    return {
      edition: getEdition(),
      enterpriseLoaded: false,
      errors: [],
    };
  }
  bootstrapped = true;

  const edition = getEdition();
  const errors: string[] = [];
  let enterpriseLoaded = false;

  if (isEnterpriseEdition()) {
    try {
      const mod = await loader();
      if (mod) {
        const { extensions } = await import("./index");
        mod.register(extensions);
        enterpriseLoaded = true;
      }
    } catch (err) {
      errors.push(
        `Failed to bootstrap enterprise package: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return { edition, enterpriseLoaded, errors };
}

/**
 * Test helper — resets the idempotency guard so repeat calls register again.
 * Not exported from the package index; used only by bootstrap tests.
 */
export function _resetBootstrapState(): void {
  bootstrapped = false;
}
