import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

  // ── #1646: tenant_id is indexed, and cross-tenant references are impossible ──

  const TENANT_TABLES_1646 = [
    "user",
    "connection",
    "dashboard",
    "dashboard_share",
    "widget_template",
    "api_key",
    "sso_provider",
    "audit_log",
  ];

  it("indexes tenant_id as the LEADING column on every tenant-scoped table (#1646)", async () => {
    // Every query on these tables filters by tenant_id (CLAUDE.md). Without
    // an index leading on it, each is a sequential scan whose cost grows with
    // every other tenant's data. A composite that merely *contains* tenant_id
    // after another column (user_email_tenant_unique) does not count.
    const client = postgres(connectionString, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    const rows = await client`
      SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public'
    `;
    const leading = new Set(
      rows
        .filter((r) => /\((tenant_id)[,)]/.test(r.indexdef as string))
        .map((r) => r.tablename as string),
    );
    for (const table of TENANT_TABLES_1646) {
      expect(leading.has(table), `${table}: no index leads on tenant_id`).toBe(
        true,
      );
    }
    await client.end();
  }, 60_000);

  it("references users and dashboards by (tenant_id, id), so a row cannot point across tenants (#1646)", async () => {
    const client = postgres(connectionString, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    const cons = await client`
      SELECT conname, contype, array_length(conkey, 1) AS width
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    `;
    const byName = new Map(cons.map((c) => [c.conname as string, c]));
    for (const name of [
      "user_tenant_id_unique",
      "dashboard_tenant_id_unique",
    ]) {
      expect(byName.get(name)?.contype, `${name} missing`).toBe("u");
    }
    for (const name of [
      "connection_tenant_user_fk",
      "dashboard_tenant_user_fk",
      "dashboard_share_tenant_dashboard_fk",
      "dashboard_share_tenant_user_fk",
      "widget_template_tenant_created_by_fk",
      "api_key_tenant_user_fk",
    ]) {
      const c = byName.get(name);
      expect(c?.contype, `${name} missing`).toBe("f");
      expect(Number(c?.width), `${name} is not composite`).toBe(2);
    }
    await client.end();
  }, 60_000);

  it("gives dashboard a NOT NULL text[] tags column defaulting to empty (#1692)", async () => {
    const client = postgres(connectionString, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    const [col] = await client`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dashboard' AND column_name = 'tags'
    `;
    expect(col, "dashboard.tags missing").toBeDefined();
    expect(col.data_type).toBe("ARRAY");
    expect(col.is_nullable).toBe("NO");
    expect(col.column_default).toMatch(/'\{\}'::text\[\]/);
    await client.end();
  }, 60_000);

  it("rejects a connection that references a user in another tenant (#1646)", async () => {
    // The structural guarantee itself: before this, nothing but convention
    // stopped tenant A's row from pointing at tenant B's user.
    const client = postgres(connectionString, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    await client`INSERT INTO "user" (id, email, tenant_id) VALUES ('u-a', 'a@x', 't1'), ('u-b', 'b@x', 't2')`;
    await expect(
      client`INSERT INTO connection (id, "userId", tenant_id, name, type, "configEncrypted")
             VALUES ('c-x', 'u-b', 't1', 'cross', 'neo4j', 'enc')`,
    ).rejects.toMatchObject({ code: "23503" });
    // Same tenant is fine.
    await client`INSERT INTO connection (id, "userId", tenant_id, name, type, "configEncrypted")
                 VALUES ('c-ok', 'u-a', 't1', 'own', 'neo4j', 'enc')`;
    await client`DELETE FROM "user" WHERE id IN ('u-a', 'u-b')`;
    await client.end();
  }, 60_000);

  it("plans a tenant-scoped dashboard list as an index scan, not a table scan (#1646)", async () => {
    // The acceptance criterion, on enough rows that the planner has a real
    // choice: 50 tenants x 100 dashboards; a tenant's list is 2% of the table.
    const client = postgres(connectionString, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    await client`
      INSERT INTO "user" (id, email, tenant_id)
      SELECT 'u' || t, 'u' || t || '@x', 't' || t FROM generate_series(1, 50) t
    `;
    await client`
      INSERT INTO dashboard (id, "userId", tenant_id, name)
      SELECT 'd' || t || '-' || n, 'u' || t, 't' || t, 'dash ' || n
      FROM generate_series(1, 50) t, generate_series(1, 100) n
    `;
    await client`ANALYZE dashboard`;
    const plan = (
      await client`EXPLAIN SELECT id, name FROM dashboard WHERE tenant_id = 't7' ORDER BY id LIMIT 50`
    )
      .map((r) => r["QUERY PLAN"] as string)
      .join("\n");
    expect(plan, plan).toMatch(/Index/);
    expect(plan, plan).not.toMatch(/Seq Scan on dashboard/);
    await client`DELETE FROM "user" WHERE id LIKE 'u%'`;
    await client.end();
  }, 90_000);

  it("adds the (tenant_id, id) constraints cleanly to a populated single-tenant install (#1646)", async () => {
    // The deployment path is an EXISTING database migrating in place, not a
    // fresh one. Apply the initial migration alone into its own database,
    // populate it the way a single-tenant install looks (every row on the
    // "default" tenant), then let the migrator bring it to head: the uniques
    // and composite FKs must add over live rows, and the rows must survive.
    const admin = postgres(connectionString, { max: 1 });
    await admin`CREATE DATABASE upgrade_1646`;
    await admin.end();
    const client = postgres(
      `postgres://${container.getUsername()}:${container.getPassword()}@${container.getHost()}:${container.getPort()}/upgrade_1646`,
      { max: 1 },
    );
    // Guards: this test must run in its own, empty database. If either fails,
    // the failure names the cause instead of "type already exists" downstream.
    expect((await client`SELECT current_database() AS db`)[0].db).toBe(
      "upgrade_1646",
    );
    expect(
      (
        await client`SELECT count(*)::int AS n FROM pg_type WHERE typname = 'connection_visibility'`
      )[0].n,
    ).toBe(0);
    // Bring the database to the INITIAL migration only, through the migrator
    // itself so it is recorded as applied: a folder holding 0000 and a
    // one-entry journal. Applying the SQL raw would leave drizzle's bookkeeping
    // empty and the later migrate() would start again from 0000.
    const journal = JSON.parse(
      readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string }> };
    const initialOnly = mkdtempSync(path.join(tmpdir(), "nb-1646-"));
    mkdirSync(path.join(initialOnly, "meta"));
    const first = journal.entries[0];
    copyFileSync(
      path.join(MIGRATIONS_FOLDER, `${first.tag}.sql`),
      path.join(initialOnly, `${first.tag}.sql`),
    );
    writeFileSync(
      path.join(initialOnly, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: [first] }),
    );
    await migrate(drizzle(client), { migrationsFolder: initialOnly });
    await client`INSERT INTO "user" (id, email) VALUES ('u1', 'u1@x')`;
    await client`INSERT INTO dashboard (id, "userId", name) VALUES ('d1', 'u1', 'dash')`;
    await client`INSERT INTO connection (id, "userId", name, type, "configEncrypted") VALUES ('c1', 'u1', 'conn', 'neo4j', 'enc')`;
    await client`INSERT INTO dashboard_share (id, "dashboardId", "userId", role) VALUES ('s1', 'd1', 'u1', 'viewer')`;
    await client`INSERT INTO api_key (id, "userId", key_hash, name) VALUES ('k1', 'u1', 'h1', 'key')`;

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

    const fks = await client`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE contype = 'f' AND array_length(conkey, 1) = 2 AND connamespace = 'public'::regnamespace
    `;
    expect(fks[0].n).toBe(6);
    for (const t of ["dashboard", "connection", "dashboard_share", "api_key"]) {
      const rows = await client.unsafe(`SELECT count(*)::int AS n FROM "${t}"`);
      expect(rows[0].n, `${t} lost rows across the upgrade`).toBe(1);
    }
    // A pre-existing dashboard picks up the empty tags default (#1692).
    const [d1] = await client`SELECT tags FROM dashboard WHERE id = 'd1'`;
    expect(d1.tags).toEqual([]);
    await client.end();
  }, 90_000);
});
