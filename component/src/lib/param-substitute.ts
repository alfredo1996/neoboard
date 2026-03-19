/**
 * Replace $param_xxx placeholders in a string with values from a params record.
 * Unresolved placeholders are left as-is (so the user sees what's missing).
 */
export function substituteParams(
  text: string,
  params?: Record<string, unknown>,
): string {
  if (!params) return text;
  return text.replace(/\$param_(\w+)/g, (match, name) => {
    const key = "param_" + name;
    if (Object.hasOwn(params, key)) {
      return String(params[key] ?? "");
    }
    return match; // leave unresolved
  });
}
