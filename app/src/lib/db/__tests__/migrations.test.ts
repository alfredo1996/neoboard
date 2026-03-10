import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../../drizzle/migrations");

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
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    ).resolves.not.toThrow();

    await client.end();
  }, 30_000);

  it("should run all migrations a second time without errors (idempotency)", async () => {
    // The first run already happened in the test above.
    // Running again on the same populated DB must succeed.
    const client = postgres(connectionString, { max: 1 });
    const db = drizzle(client);

    await expect(
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    ).resolves.not.toThrow();

    await client.end();
  }, 30_000);

  it("should produce the expected schema after migrations", async () => {
    const client = postgres(connectionString, { max: 1 });

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
  }, 10_000);
});
