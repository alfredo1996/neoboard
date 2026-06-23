import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * #1004: the drizzle client ran on a single Postgres connection
 * (`max: 1`), serializing every API request in the process. Under
 * E2E/production concurrency, queries queued for seconds and login/
 * users/form flows timed out — the "late-suite failure cluster".
 */

// Signature declared via the generic so mock.calls carries the (uri,
// options) tuple — a zero-arg vi.fn() makes calls[0][1] a tuple-index
// type error under tsc (this broke the release/1.1 post-merge typecheck).
const mockPostgres = vi.fn<
  (uri?: string, options?: { max?: number }) => unknown
>(() => ({}));
vi.mock("postgres", () => ({ default: mockPostgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: vi.fn(() => ({})) }));

describe("app DB pool sizing (#1004)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to a real pool, not a single serialized connection", async () => {
    await import("../index");
    const options = mockPostgres.mock.calls[0]?.[1];
    expect(options?.max).toBeGreaterThanOrEqual(5);
  });

  it("honors the DB_POOL_MAX override", async () => {
    vi.stubEnv("DB_POOL_MAX", "25");
    await import("../index");
    const options = mockPostgres.mock.calls[0]?.[1];
    expect(options?.max).toBe(25);
  });
});
