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
    -- keys (#2508)
    CREATE TABLE public.customers (id INT PRIMARY KEY);
    CREATE TABLE public.orders_c (
      id INT PRIMARY KEY,
      customer_id INT REFERENCES public.customers(id)
    );
    CREATE TABLE public.order_lines (
      line_no INT, order_id INT,
      PRIMARY KEY (order_id, line_no)
    );
    CREATE TABLE public.shipments (
      order_id INT, line_no INT, note TEXT,
      FOREIGN KEY (order_id, line_no)
        REFERENCES public.order_lines (order_id, line_no)
    );
    CREATE TABLE public.nokeys (a INT);
    CREATE TABLE public.stock_refs (sku TEXT REFERENCES warehouse.stock(sku));
    -- partitioned parent, its partition, and an FK to the parent (#2508)
    CREATE TABLE public.events (id INT, at DATE, PRIMARY KEY (id, at))
      PARTITION BY RANGE (at);
    CREATE TABLE public.events_2026 PARTITION OF public.events
      FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
    CREATE TABLE public.notes (
      ev INT, ev_at DATE,
      FOREIGN KEY (ev, ev_at) REFERENCES public.events (id, at)
    );
    -- a partitioned table with a foreign key to a partition; its partition
    -- inherits the key (#2508)
    CREATE TABLE public.targets (id INT PRIMARY KEY) PARTITION BY RANGE (id);
    CREATE TABLE public.targets_1 PARTITION OF public.targets
      FOR VALUES FROM (0) TO (100);
    CREATE TABLE public.hits (id INT, t INT REFERENCES public.targets_1 (id))
      PARTITION BY RANGE (id);
    CREATE TABLE public.hits_1 PARTITION OF public.hits
      FOR VALUES FROM (0) TO (100);
    -- exact types, a dropped column, a column-level grant (#2532)
    CREATE TYPE public.mood AS ENUM ('ok', 'bad');
    CREATE DOMAIN public.nn_int AS INT NOT NULL;
    CREATE TABLE public.typed (
      id INT PRIMARY KEY, price NUMERIC(12,2) NOT NULL, tags TEXT[],
      feel public.mood, name VARCHAR(255), gone INT, dom public.nn_int
    );
    ALTER TABLE public.typed DROP COLUMN gone;
    CREATE TABLE public.partial_grant (a INT, b INT, c INT);
    CREATE ROLE reader LOGIN PASSWORD 'reader-pw';
    CREATE ROLE colreader LOGIN PASSWORD 'colreader-pw';
    GRANT USAGE ON SCHEMA public TO colreader;
    GRANT SELECT (a) ON public.partial_grant TO colreader;
    GRANT USAGE ON SCHEMA public TO reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader;
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

  describe("primary and foreign keys (#2508)", () => {
    // A read-only role that owns nothing: information_schema would hide the
    // foreign-key targets from it.
    const fetchAsReader = async () => {
      const schema = await new PostgresSchemaManager().fetchSchema({
        ...authConfig,
        username: "reader",
        password: "reader-pw",
      });
      return (n: string) => schema.tables?.find((x) => x.name === n);
    };

    it("reports primary and foreign keys in column order, as a read-only role", async () => {
      const t = await fetchAsReader();
      expect(t("customers")).toMatchObject({
        primaryKey: ["id"],
        foreignKeys: [],
      });
      expect(t("orders_c")).toMatchObject({
        primaryKey: ["id"],
        foreignKeys: [
          {
            columns: ["customer_id"],
            refTable: "customers",
            refColumns: ["id"],
          },
        ],
      });
      expect(t("order_lines")?.primaryKey).toEqual(["order_id", "line_no"]);
      expect(t("shipments")).toMatchObject({
        primaryKey: [],
        foreignKeys: [
          {
            columns: ["order_id", "line_no"],
            refTable: "order_lines",
            refColumns: ["order_id", "line_no"],
          },
        ],
      });
      expect(t("nokeys")).toMatchObject({ primaryKey: [], foreignKeys: [] });
      expect(t("stock_refs")?.foreignKeys).toEqual([
        { columns: ["sku"], refTable: "warehouse.stock", refColumns: ["sku"] },
      ]);
    });

    it("reports the key of a partitioned table, and one foreign key to it, not one per partition", async () => {
      const t = await fetchAsReader();
      expect(t("events")?.primaryKey).toEqual(["id", "at"]);
      expect(t("notes")?.foreignKeys).toEqual([
        {
          columns: ["ev", "ev_at"],
          refTable: "events",
          refColumns: ["id", "at"],
        },
      ]);
    });

    it("keeps the foreign key a partition inherits when the key points at a partition", async () => {
      const t = await fetchAsReader();
      const key = [
        { columns: ["t"], refTable: "targets_1", refColumns: ["id"] },
      ];
      expect(t("hits")?.foreignKeys).toEqual(key);
    });
  });

  describe("columns from pg_catalog (#2532)", () => {
    const fetchTables = async (username = "reader", password = "reader-pw") => {
      const schema = await new PostgresSchemaManager().fetchSchema({
        ...authConfig,
        username,
        password,
      });
      return (n: string) => schema.tables?.find((x) => x.name === n);
    };

    it("lists a partitioned table once, under its parent, and no partition", async () => {
      const t = await fetchTables();
      expect(t("events")?.columns.map((c) => c.name)).toEqual(["id", "at"]);
      expect(t("events_2026")).toBeUndefined();
      expect(t("hits_1")).toBeUndefined();
    });

    it("reports exact types and omits a dropped column", async () => {
      const t = await fetchTables();
      expect(
        t("typed")?.columns.map((c) => [c.name, c.type, c.nullable]),
      ).toEqual([
        ["id", "integer", false],
        ["price", "numeric(12,2)", false],
        ["tags", "text[]", true],
        ["feel", "mood", true],
        ["name", "character varying(255)", true],
        ["dom", "nn_int", false],
      ]);
    });

    it("shows a role only the columns it was granted, not the whole table", async () => {
      const t = await fetchTables("colreader", "colreader-pw");
      expect(t("partial_grant")?.columns.map((c) => c.name)).toEqual(["a"]);
    });
  });
});
