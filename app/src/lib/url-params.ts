/**
 * URL parameter deep-linking utilities.
 * Syncs dashboard parameters with URL search params.
 */

const PARAM_PREFIX = "param_";

/**
 * Extract parameter values from URL search params.
 * Only keys prefixed with "param_" are extracted; the prefix is stripped.
 * e.g., ?param_year=1999&param_dept=Sales → { year: "1999", dept: "Sales" }
 */
export function parseUrlParams(
  searchParams: URLSearchParams,
): Record<string, string> {
  const result: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key.startsWith(PARAM_PREFIX) && value) {
      result[key.slice(PARAM_PREFIX.length)] = value;
    }
  });
  return result;
}

/**
 * Build URL search params from parameter store values.
 * Only non-empty values are included, prefixed with "param_".
 * e.g., { year: "1999", dept: "" } → ?param_year=1999
 */
export function buildUrlParams(
  params: Record<string, unknown>,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      sp.set(`${PARAM_PREFIX}${key}`, String(value));
    }
  }
  sp.sort();
  return sp;
}
