/**
 * Enterprise extension point registry.
 *
 * The core always creates an empty registry. When NEOBOARD_EDITION=enterprise,
 * it dynamically imports @neoboard/enterprise and calls register() to populate
 * the registry with enterprise feature handlers.
 *
 * This keeps enterprise code out of the open-source build — the dynamic import
 * only resolves when the enterprise package is installed.
 */

export interface ExtensionRegistry {
  /** Registered SSO/OIDC provider configurations (populated by enterprise). */
  ssoProviders: unknown[];
}

function createEmptyRegistry(): ExtensionRegistry {
  return {
    ssoProviders: [],
  };
}

/** Check if an error (or its cause chain) indicates a missing module. */
function checkModuleNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as NodeJS.ErrnoException;
  if (
    e.code === "MODULE_NOT_FOUND" ||
    e.code === "ERR_MODULE_NOT_FOUND" ||
    e.message.includes("Cannot find module") ||
    e.message.includes("Cannot find package")
  ) {
    return true;
  }
  // Check the cause chain (e.g. bundler/test-runner wrappers)
  if (e.cause) return checkModuleNotFound(e.cause);
  return false;
}

let registry: ExtensionRegistry | null = null;

/**
 * Initialize the extension registry. Call once at app startup.
 * When NEOBOARD_EDITION=enterprise, loads and calls the enterprise register().
 */
export async function bootstrapExtensions(): Promise<ExtensionRegistry> {
  registry = createEmptyRegistry();

  const edition = process.env.NEOBOARD_EDITION;
  if (edition !== "enterprise") {
    return registry;
  }

  try {
    // Use a variable to prevent webpack from statically analyzing the import.
    // This ensures the build succeeds even when @neoboard/enterprise is not installed.
    const moduleName = "@neoboard/enterprise";
    const enterprise = await import(/* webpackIgnore: true */ moduleName);
    enterprise.register(registry);
  } catch (err: unknown) {
    // Distinguish "module not installed" from runtime errors inside register().
    // MODULE_NOT_FOUND / ERR_MODULE_NOT_FOUND means the package isn't installed —
    // that's expected in community mode. Any other error is a real bug that
    // should propagate so it doesn't silently disable enterprise features.
    const isModuleNotFound = checkModuleNotFound(err);

    if (isModuleNotFound) {
      console.warn(
        "[extensions] NEOBOARD_EDITION=enterprise but @neoboard/enterprise is not installed. Running in community mode.",
      );
    } else {
      throw err;
    }
  }

  return registry;
}

/**
 * Get the current extension registry. Throws if bootstrapExtensions() has not been called.
 */
export function getExtensions(): ExtensionRegistry {
  if (!registry) {
    throw new Error(
      "Extension registry not initialized. Call bootstrapExtensions() first.",
    );
  }
  return registry;
}
