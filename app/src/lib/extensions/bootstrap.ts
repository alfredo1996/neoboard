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

let bootstrapped = false;

/**
 * Initialize the extension system. Called once at app startup.
 *
 * In community edition this is a no-op. In enterprise edition it attempts
 * to dynamically import `@neoboard/enterprise` and call its register
 * function. If the package is not installed the bootstrap reports
 * `enterpriseLoaded: false` but does NOT throw — the app stays usable.
 *
 * Idempotent — calling twice has no additional effect.
 */
export async function bootstrapExtensions(): Promise<BootstrapResult> {
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
      // Dynamic import isolates the enterprise package so community builds
      // do not pay any cost for enterprise code. String interpolation keeps
      // bundlers from resolving the import at build time.
      const pkg = "@neoboard/enterprise";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import(/* @vite-ignore */ pkg).catch(() => null);
      if (mod?.register) {
        const { extensions } = await import("./index");
        mod.register(extensions as unknown as Extensions);
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
