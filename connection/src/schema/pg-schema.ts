import { PostgresConnectionModule } from "../postgresql/PostgresConnectionModule";
import { runBoundedQuery } from "../postgresql/utils";
import { optionalNumber } from "../config-bag";
import type {
  ColumnDef,
  ConnectorConfig,
  DatabaseSchema,
  TableDef,
} from "@neoboard/connector-sdk";
import type { SchemaManager } from "./schema-manager";

// pg_catalog, not information_schema: those views run a privilege function and
// a type formatter per row through several joins, ~25x slower on 50k columns
// (#2532). The privilege test is per column, as the view's is: a role granted
// some columns of a table sees only those. A partition is not a table of its
// own here (relispartition); its parent lists the columns. format_type gives
// the exact type (numeric(12,2), text[], the enum's name); a NOT NULL domain
// makes its columns not null, as the view says.
const SCHEMA_QUERY = `
SELECT c.relname AS table_name, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       CASE WHEN a.attnotnull OR (t.typtype = 'd' AND t.typnotnull) THEN 'NO' ELSE 'YES' END AS is_nullable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_type t ON t.oid = a.atttypid
WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
  AND (pg_has_role(c.relowner, 'USAGE')
       OR has_column_privilege(c.oid, a.attnum, 'SELECT, INSERT, UPDATE, REFERENCES'))
ORDER BY c.relname, a.attnum
`;

// pg_constraint, not information_schema.constraint_column_usage: that view
// lists only tables owned by an enabled role, so a read-only user would lose
// every foreign-key target (#2508). Columns come out in key order. Partitioned
// parents (relkind p) are tables too; a partition keeps the key it inherits.
const KEYS_QUERY = `
SELECT
  c.relname AS table_name,
  con.contype,
  (SELECT array_agg(a.attname::text ORDER BY k.ord)
     FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
     JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
  ) AS columns,
  CASE WHEN rn.nspname = 'public' THEN rc.relname
       ELSE rn.nspname || '.' || rc.relname END AS ref_table,
  (SELECT array_agg(a.attname::text ORDER BY k.ord)
     FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
     JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
  ) AS ref_columns
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid AND c.relkind IN ('r', 'p')
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
LEFT JOIN pg_class rc ON rc.oid = con.confrelid
LEFT JOIN pg_namespace rn ON rn.oid = rc.relnamespace
WHERE con.contype IN ('p', 'f')
  -- A foreign key to a partitioned table is cloned once per partition, on the
  -- same referencing table as its parent (conparentid <> 0): keep the parent.
  -- A key a partition inherits from its partitioned parent has a parent on
  -- another table, and stays; so does one declared by hand (conparentid = 0).
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint par
    WHERE par.oid = con.conparentid AND par.conrelid = con.conrelid
  )
ORDER BY c.relname, con.conname
`;

// ref_* are set for every contype f row, null for p.
interface KeyRow {
  table_name: string;
  contype: "p" | "f";
  columns: string[];
  ref_table: string;
  ref_columns: string[];
}

interface SchemaRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

/**
 * Fetches schema information from a PostgreSQL database.
 *
 * Reads the public schema's tables and columns, and their keys, from pg_catalog.
 */
export class PostgresSchemaManager implements SchemaManager {
  async fetchSchema(config: ConnectorConfig): Promise<DatabaseSchema> {
    const module = new PostgresConnectionModule(config);
    const pool = module.getPool();

    if (!pool) {
      throw new Error("Failed to create PostgreSQL connection pool");
    }

    // pool.end() must run even if pool.connect() itself throws (bad creds,
    // unreachable host) — otherwise every failed introspection leaks a Pool
    // with its idle timers and error listener. So the checkout lives inside the
    // try whose finally ends the pool. (#MEDIUM) runBoundedQuery guards the
    // checked-out client and bounds the query — this was the one checkout in
    // the package without the guard (#1302).
    try {
      // Two clients of the same per-fetch pool (max 10), each checked out by
      // runBoundedQuery for one query: the reads overlap instead of queueing.
      const timeout = optionalNumber(config.statementTimeout);
      const [rows, keyRows] = await Promise.all([
        runBoundedQuery<SchemaRow>(pool, SCHEMA_QUERY, timeout),
        runBoundedQuery<KeyRow>(pool, KEYS_QUERY, timeout),
      ]);

      const tableMap = new Map<string, ColumnDef[]>();
      for (const row of rows) {
        let columns = tableMap.get(row.table_name);
        if (!columns) {
          columns = [];
          tableMap.set(row.table_name, columns);
        }
        columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === "YES",
        });
      }

      const primaryKeys = new Map<string, string[]>();
      const foreignKeys = new Map<string, TableDef["foreignKeys"]>();
      for (const k of keyRows) {
        if (k.contype === "p") {
          primaryKeys.set(k.table_name, k.columns);
          continue;
        }
        const list = foreignKeys.get(k.table_name) ?? [];
        list.push({
          columns: k.columns,
          refTable: k.ref_table,
          refColumns: k.ref_columns,
        });
        foreignKeys.set(k.table_name, list);
      }

      const tables: TableDef[] = Array.from(tableMap.entries()).map(
        ([name, columns]) => ({
          name,
          columns,
          primaryKey: primaryKeys.get(name) ?? [],
          foreignKeys: foreignKeys.get(name) ?? [],
        }),
      );

      return { type: "postgresql", tables };
    } finally {
      await pool.end();
    }
  }
}
