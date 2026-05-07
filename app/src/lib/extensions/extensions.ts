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
  } catch {
    // Enterprise module not installed — graceful fallback to community edition
    console.warn(
      "[extensions] NEOBOARD_EDITION=enterprise but @neoboard/enterprise is not installed. Running in community mode.",
    );
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
