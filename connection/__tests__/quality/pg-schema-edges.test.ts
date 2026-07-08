/**
 * Coverage gaps from #742 — PostgreSQL schema introspection edge cases:
 * multiple schemas, views, and materialized views.
 *
 * The introspection query is scoped to `table_schema = 'public'` and
 * `table_type = 'BASE TABLE'` BY DESIGN (widgets query the schema the
 * connection lands in; views are read paths, not schema surface). These
 * tests pin that contract so a future change is a conscious decision.
 */
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { PostgresSchemaManager } from "../../src/schema/pg-schema";
import { AuthType } from "@neoboard/connector-sdk";

jest.setTimeout(120_000);

let container: StartedPostgreSqlContainer;
let authConfig: {
  username: string;
  password: string;
  authType: AuthType;
  uri: string;
};

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  authConfig = {
    username: container.getUsername(),
    password: container.getPassword(),
    authType: AuthType.NATIVE,
    uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
  };

  const client = new Client({
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
  });
  await client.connect();
  await client.query(`
    CREATE TABLE public.orders (id INT PRIMARY KEY, total NUMERIC NOT NULL);
    CREATE VIEW public.orders_view AS SELECT id FROM public.orders;
    CREATE MATERIALIZED VIEW public.orders_mv AS SELECT id FROM public.orders;
    CREATE SCHEMA warehouse;
    CREATE TABLE warehouse.stock (sku TEXT PRIMARY KEY, qty INT);
  `);
  await client.end();
});

afterAll(async () => {
  await container.stop();
});

describe("PostgreSQL schema introspection edges (#742 items 15/16)", () => {
  it("introspects public base tables with their columns", async () => {
    const schema = await new PostgresSchemaManager().fetchSchema(authConfig);
    const tables = schema as unknown as {
      tables: Array<{ name: string; columns: Array<{ name: string }> }>;
    };
    const orders = tables.tables.find((t) => t.name === "orders");
    expect(orders).toBeDefined();
    expect(orders!.columns.map((c) => c.name).sort()).toEqual(["id", "total"]);
  });

  it("excludes views and materialized views (BASE TABLE scope — by design)", async () => {
    const schema = await new PostgresSchemaManager().fetchSchema(authConfig);
    const names = (
      schema as unknown as { tables: Array<{ name: string }> }
    ).tables.map((t) => t.name);
    expect(names).not.toContain("orders_view");
    expect(names).not.toContain("orders_mv");
  });

  it("excludes non-public schemas (public scope — by design)", async () => {
    const schema = await new PostgresSchemaManager().fetchSchema(authConfig);
    const names = (
      schema as unknown as { tables: Array<{ name: string }> }
    ).tables.map((t) => t.name);
    expect(names).not.toContain("stock");
  });
});
