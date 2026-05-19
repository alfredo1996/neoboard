/**
 * Replace `$param_xxx` placeholders in a string with values from a params record.
 * Unresolved placeholders are left as-is (so the user sees what's missing).
 *
 * ## Trust model
 *
 * This helper is intended for **display contexts only** (markdown content, widget
 * titles). It does NOT escape values. Do not use the output to construct SQL or
 * Cypher — query execution goes through `rewriteParamsForPostgres` and Neo4j's
 * native `$param` binding, both of which are safe. For URL contexts use
 * {@link substituteParamsInUrl} so values are percent-encoded.
 *
 * Arrays and objects are stringified via `String()` (matches the existing
 * formatting in `formatParameterValue`).
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

/**
 * Like {@link substituteParams} but percent-encodes each substituted value so
 * the result is safe for use as an href / URL. Unresolved placeholders are
 * left untouched.
 *
 * Also strips a leading `javascript:` (case-insensitive, ignoring leading
 * whitespace and ASCII control chars) from the final URL so a user-controlled
 * parameter value cannot produce a JS-scheme XSS in a rendered anchor.
 */
export function substituteParamsInUrl(
  url: string,
  params?: Record<string, unknown>,
): string {
  const substituted = !params
    ? url
    : url.replace(/\$param_(\w+)/g, (match, name) => {
        const key = "param_" + name;
        if (Object.hasOwn(params, key)) {
          return encodeURIComponent(String(params[key] ?? ""));
        }
        return match;
      });
  // Strip dangerous schemes regardless of casing / leading whitespace / control chars
  // eslint-disable-next-line no-control-regex
  const trimmed = substituted.replace(/^[\s\u0000-\u001f]+/, "");
  if (/^javascript:/i.test(trimmed) || /^data:/i.test(trimmed)) {
    return "#";
  }
  return substituted;
}
