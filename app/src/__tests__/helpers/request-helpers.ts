/**
 * Shared request/params builders for API route tests.
 */

/** Create a minimal Request stub that returns `body` from `.json()`. */
export function makeRequest(body: unknown, url?: string) {
  return { json: async () => body, ...(url ? { url } : {}) } as Request;
}

/** Create a route params object for Next.js dynamic routes. */
export function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
