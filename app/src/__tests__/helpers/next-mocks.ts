/**
 * Shared NextResponse mock factory for API route tests.
 *
 * Usage with vi.mock (hoisted):
 *   vi.mock("next/server", () => nextResponseMockFactory());
 *
 * Usage with vi.doMock (inside beforeEach):
 *   vi.doMock("next/server", () => nextResponseMockFactory());
 */
export function nextResponseMockFactory() {
  return {
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) => {
        const headerEntries =
          init?.headers && typeof init.headers === "object"
            ? Object.entries(init.headers as Record<string, string>)
            : [];
        const headerMap = new Map(headerEntries);
        return {
          status: init?.status ?? 200,
          headers: {
            get: (k: string) => headerMap.get(k) ?? null,
          },
          json: async () => body,
          _body: body,
        };
      },
    },
  };
}
