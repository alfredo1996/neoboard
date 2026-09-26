import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  sqlCalls,
  mockEnd,
  mockPostgres,
  mockDrizzle,
  mockDrizzleInstance,
  mockMigrate,
} = vi.hoisted(() => {
  const sqlCalls: string[] = [];
  const mockEnd = vi.fn(async () => {});
  // postgres() returns a tagged-template client; record each statement text.
  const mockClient = Object.assign(
    (strings: TemplateStringsArray) => {
      sqlCalls.push(strings.join("?"));
      return Promise.resolve([]);
    },
    { end: mockEnd },
  );
  const mockPostgres = vi.fn(() => mockClient);
  const mockDrizzleInstance = { __drizzle: true };
  const mockDrizzle = vi.fn(() => mockDrizzleInstance);
  const mockMigrate = vi.fn(async () => {});
  return {
    sqlCalls,
    mockEnd,
    mockPostgres,
    mockDrizzle,
    mockDrizzleInstance,
    mockMigrate,
  };
});

vi.mock("postgres", () => ({ default: mockPostgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: mockDrizzle }));
vi.mock("drizzle-orm/postgres-js/migrator", () => ({ migrate: mockMigrate }));

import { migrateOnBoot, shouldMigrateOnBoot } from "../migrate-on-boot";
import { migrateWithLock } from "../migrate.mjs";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const savedUrl = process.env.DATABASE_URL;
const savedDir = process.env.MIGRATIONS_DIR;

beforeEach(() => {
  vi.clearAllMocks();
  sqlCalls.length = 0;
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
  delete process.env.MIGRATIONS_DIR;
});

afterEach(() => {
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
  if (savedDir === undefined) delete process.env.MIGRATIONS_DIR;
  else process.env.MIGRATIONS_DIR = savedDir;
});

describe("shouldMigrateOnBoot", () => {
  it("is false when MIGRATE_ON_START is unset", () => {
    expect(shouldMigrateOnBoot({})).toBe(false);
  });

  it("is true for '1' and 'true' (case-insensitive)", () => {
    expect(shouldMigrateOnBoot({ MIGRATE_ON_START: "1" })).toBe(true);
    expect(shouldMigrateOnBoot({ MIGRATE_ON_START: "true" })).toBe(true);
    expect(shouldMigrateOnBoot({ MIGRATE_ON_START: "TRUE" })).toBe(true);
  });

  it("is false for '0', 'false', and garbage", () => {
    expect(shouldMigrateOnBoot({ MIGRATE_ON_START: "0" })).toBe(false);
    expect(shouldMigrateOnBoot({ MIGRATE_ON_START: "false" })).toBe(false);
    expect(shouldMigrateOnBoot({ MIGRATE_ON_START: "yes" })).toBe(false);
  });
});

describe("migrateOnBoot", () => {
  it("throws when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL;
    await expect(migrateOnBoot()).rejects.toThrow(/DATABASE_URL/);
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it("runs migrate against a single-connection client", async () => {
    await migrateOnBoot();
    expect(mockPostgres).toHaveBeenCalledWith(
      "postgresql://u:p@localhost:5432/db",
      expect.objectContaining({ max: 1 }),
    );
    expect(mockMigrate).toHaveBeenCalledWith(
      mockDrizzleInstance,
      expect.objectContaining({ migrationsFolder: "drizzle/migrations" }),
    );
  });

  it("honors MIGRATIONS_DIR override", async () => {
    process.env.MIGRATIONS_DIR = "/app/app/drizzle/migrations";
    await migrateOnBoot();
    expect(mockMigrate).toHaveBeenCalledWith(
      mockDrizzleInstance,
      expect.objectContaining({
        migrationsFolder: "/app/app/drizzle/migrations",
      }),
    );
  });

  it("takes the advisory lock before migrating and releases it after", async () => {
    await migrateOnBoot();
    expect(sqlCalls.some((s) => s.includes("pg_advisory_lock"))).toBe(true);
    expect(sqlCalls.some((s) => s.includes("pg_advisory_unlock"))).toBe(true);
    const lockIdx = sqlCalls.findIndex((s) => s.includes("pg_advisory_lock("));
    const unlockIdx = sqlCalls.findIndex((s) =>
      s.includes("pg_advisory_unlock"),
    );
    expect(lockIdx).toBeLessThan(unlockIdx);
  });

  it("releases the lock and closes the client even when migrate fails", async () => {
    mockMigrate.mockRejectedValueOnce(new Error("DDL exploded"));
    await expect(migrateOnBoot()).rejects.toThrow("DDL exploded");
    expect(sqlCalls.some((s) => s.includes("pg_advisory_unlock"))).toBe(true);
    expect(mockEnd).toHaveBeenCalled();
  });

  it("closes the client on success", async () => {
    await migrateOnBoot();
    expect(mockEnd).toHaveBeenCalled();
  });
});

// The CLI bounds its wait for the lock (#2019); the bound must end with the
// wait, and hand the migration back whatever lock_timeout the role or the
// database sets, not 0, which would lift that limit for every statement.
describe("migrateWithLock's lock timeout (#2019)", () => {
  it("bounds only the wait for the lock, then resets to the session default", async () => {
    await migrateWithLock("postgresql://u:p@localhost:5432/db", "m", {
      lockTimeoutMs: 500,
    });
    const set = sqlCalls.findIndex((s) =>
      s.includes("set_config('lock_timeout'"),
    );
    const lock = sqlCalls.findIndex((s) => s.includes("pg_advisory_lock("));
    const reset = sqlCalls.findIndex((s) =>
      /^\s*reset lock_timeout\s*$/i.test(s),
    );
    expect(set).toBeGreaterThanOrEqual(0);
    expect(set).toBeLessThan(lock);
    expect(reset).toBeGreaterThan(lock);
    expect(sqlCalls.some((s) => s.includes("'0'"))).toBe(false);
  });

  it("touches no timeout when none is asked for, as at boot", async () => {
    await migrateOnBoot();
    expect(sqlCalls.some((s) => /lock_timeout/i.test(s))).toBe(false);
  });
});
