/**
 * Shared request/params builders for API route tests.
 */

/**
 * Create a minimal Request stub that returns `body` from `.json()` and
 * exposes a `headers.get()` shim. Routes can call `request.headers.get(...)`
 * and receive `null` for absent headers without blowing up the mock.
 */
export function makeRequest(
  body: unknown,
  urlOrOptions?: string | { url?: string; headers?: Record<string, string> },
) {
  const options =
    typeof urlOrOptions === "string"
      ? { url: urlOrOptions }
      : (urlOrOptions ?? {});
  const headerMap = new Map<string, string>(
    Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    json: async () => body,
    ...(options.url ? { url: options.url } : {}),
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
  } as Request;
}

/** Create a route params object for Next.js dynamic routes. */
export function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
