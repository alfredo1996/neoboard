import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";

const MIGRATIONS_FOLDER = path.resolve(
  __dirname,
  "../../../../drizzle/migrations",
);

/**
 * Integration test: verifies that running all Drizzle migrations twice
 * on the same database produces no errors (idempotency).
 *
 * Requires Docker to be running.
 */
describe("Database migrations", () => {
  let container: StartedPostgreSqlContainer;
  let connectionString: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    connectionString = container.getConnectionUri();
  }, 60_000);

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  it("should run all migrations on a fresh database", async () => {
    const client = postgres(connectionString, { max: 1 });
    const db = drizzle(client);

    await expect(
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    ).resolves.not.toThrow();

    await client.end();
  }, 30_000);

  it("should run all migrations a second time without errors (idempotency)", async () => {
    // Runs migrate TWICE itself. It used to rely on the test above having gone
    // first, so running this case alone — or under a shuffled order — silently
    // tested the fresh-database path instead of idempotency (#1630).
    const client = postgres(connectionString, { max: 1 });
    const db = drizzle(client);

    await expect(
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    ).resolves.not.toThrow();
    await expect(
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    ).resolves.not.toThrow();

    await client.end();
  }, 60_000);

  it("should produce the expected schema after migrations", async () => {
    const client = postgres(connectionString, { max: 1 });
    // Migrate here rather than depending on an earlier test — migrations are
    // idempotent, so this is cheap and makes the case order-independent.
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

    const tables = await client`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const tableNames = tables.map((r) => r.table_name);

    // Core tables created by migrations
    expect(tableNames).toContain("user");
    expect(tableNames).toContain("account");
    expect(tableNames).toContain("session");
    expect(tableNames).toContain("connection");
    expect(tableNames).toContain("dashboard");
    expect(tableNames).toContain("dashboard_share");
    expect(tableNames).toContain("widget_template");

    await client.end();
  }, 60_000);

  it("gives every tenant-scoped table a NOT NULL, indexed tenant_id", async () => {
    // Multi-tenancy is the repo's highest-consequence invariant and it was
    // guarded only by a source-text scan (tenant-scope.test.ts). Nothing
    // asserted the column exists in the schema at all, let alone that it
    // cannot be null or that filtering on it is indexed (#1630).
    const client = postgres(connectionString, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

    const TENANT_TABLES = [
      "user",
      "connection",
      "dashboard",
      "dashboard_share",
      "widget_template",
      "api_key",
      "sso_provider",
      "audit_log",
    ];

    const columns = await client`
      SELECT table_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'tenant_id'
    `;
    const byTable = new Map(
      columns.map((r) => [r.table_name as string, r.is_nullable as string]),
    );

    for (const table of TENANT_TABLES) {
      expect(byTable.has(table), `${table} has no tenant_id column`).toBe(true);
      expect(byTable.get(table), `${table}.tenant_id is nullable`).toBe("NO");
    }

    await client.end();
  }, 60_000);
});
