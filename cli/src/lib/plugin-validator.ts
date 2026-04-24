/**
 * Validates an exported plugin object from an npm package.
 * Checks that it has the required fields for either a chart or connector plugin.
 */

const VALID_CATEGORIES = ["database", "graph", "api", "file"] as const;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  pluginType?: "chart" | "connector";
}

/**
 * Detect whether an export is a chart plugin, connector plugin, or neither.
 */
export function detectPluginType(
  obj: Record<string, unknown>,
): "chart" | "connector" | null {
  const hasTransform = typeof obj.transform === "function";
  const hasCreateModule = typeof obj.createModule === "function";

  if (hasTransform && hasCreateModule) return null; // ambiguous
  if (hasTransform) return "chart";
  if (hasCreateModule) return "connector";
  return null;
}

/**
 * Validate a plugin export object.
 * Returns a list of specific validation errors, or an empty list if valid.
 */
export function validatePluginExport(exported: unknown): ValidationResult {
  if (!exported || typeof exported !== "object" || Array.isArray(exported)) {
    return { valid: false, errors: ["Plugin export must be an object"] };
  }

  const obj = exported as Record<string, unknown>;
  const errors: string[] = [];

  // Required fields for all plugins
  if (typeof obj.type !== "string" || obj.type.trim() === "") {
    errors.push('"type" must be a non-empty string');
  }
  if (typeof obj.label !== "string" || obj.label.trim() === "") {
    errors.push('"label" must be a non-empty string');
  }

  // Detect type
  const pluginType = detectPluginType(obj);

  if (pluginType === null) {
    const hasTransform = typeof obj.transform === "function";
    const hasCreateModule = typeof obj.createModule === "function";
    if (hasTransform && hasCreateModule) {
      errors.push(
        "Ambiguous plugin: has both transform (chart) and createModule (connector). " +
          'Set "neoboard": { "type": "chart" | "connector" } in package.json to disambiguate.',
      );
    } else {
      errors.push(
        "Not a valid NeoBoard plugin: must export either a transform function (chart) " +
          "or a createModule function (connector).",
      );
    }
    return { valid: false, errors };
  }

  // Type-specific validation
  if (pluginType === "chart") {
    if (!Array.isArray(obj.compatibleWith) || obj.compatibleWith.length === 0) {
      errors.push(
        '"compatibleWith" must be a non-empty array of connector types',
      );
    }
  }

  if (pluginType === "connector") {
    if (
      typeof obj.category !== "string" ||
      !VALID_CATEGORIES.includes(
        obj.category as (typeof VALID_CATEGORIES)[number],
      )
    ) {
      errors.push('"category" must be one of: ' + VALID_CATEGORIES.join(", "));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    pluginType: errors.length === 0 ? pluginType : undefined,
  };
}
