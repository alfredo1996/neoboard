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
        const headers = new Map<string, string>();
        return {
          status: init?.status ?? 200,
          json: async () => body,
          headers: {
            set: (k: string, v: string) => headers.set(k, v),
            get: (k: string) => headers.get(k) ?? null,
          },
          _body: body,
        };
      },
    },
  };
}
