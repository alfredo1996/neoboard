/**
 * #2508 — the SQL schema reports primary and foreign keys, read as a
 * read-only role that owns nothing (information_schema would hide the
 * foreign-key targets from it).
 */
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { PostgresSchemaManager } from "../../src/schema/pg-schema";
import { AuthType } from "@neoboard/connector-sdk";

jest.setTimeout(120_000);

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const client = new Client({
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
  });
  await client.connect();
  await client.query(`
    CREATE TABLE public.customers (id INT PRIMARY KEY);
    CREATE TABLE public.orders (
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
    CREATE SCHEMA warehouse;
    CREATE TABLE warehouse.stock (sku TEXT PRIMARY KEY);
    CREATE TABLE public.stock_refs (sku TEXT REFERENCES warehouse.stock(sku));
    CREATE ROLE reader LOGIN PASSWORD 'reader-pw';
    GRANT USAGE ON SCHEMA public TO reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader;
  `);
  await client.end();
});

afterAll(async () => {
  await container.stop();
});

describe("PostgreSQL keys (#2508)", () => {
  it("reports primary and foreign keys in column order, as a read-only role", async () => {
    const schema = await new PostgresSchemaManager().fetchSchema({
      username: "reader",
      password: "reader-pw",
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });
    const t = (n: string) => schema.tables?.find((x) => x.name === n);
    expect(t("customers")).toMatchObject({
      primaryKey: ["id"],
      foreignKeys: [],
    });
    expect(t("orders")).toMatchObject({
      primaryKey: ["id"],
      foreignKeys: [
        { columns: ["customer_id"], refTable: "customers", refColumns: ["id"] },
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
});
