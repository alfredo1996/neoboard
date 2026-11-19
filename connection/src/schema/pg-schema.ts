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

const SCHEMA_QUERY = `
SELECT
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c
  ON t.table_name = c.table_name AND t.table_schema = c.table_schema
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position
`;

// pg_constraint, not information_schema.constraint_column_usage: that view
// lists only tables owned by an enabled role, so a read-only user would lose
// every foreign-key target (#2508). Columns come out in key order.
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
JOIN pg_class c ON c.oid = con.conrelid AND c.relkind = 'r'
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
LEFT JOIN pg_class rc ON rc.oid = con.confrelid
LEFT JOIN pg_namespace rn ON rn.oid = rc.relnamespace
WHERE con.contype IN ('p', 'f')
ORDER BY c.relname, con.conname
`;

interface KeyRow {
  table_name: string;
  contype: "p" | "f";
  columns: string[];
  ref_table: string | null;
  ref_columns: string[] | null;
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
 * Queries information_schema.tables and information_schema.columns
 * to retrieve all tables and their column definitions in the public schema.
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
      const rows = await runBoundedQuery<SchemaRow>(
        pool,
        SCHEMA_QUERY,
        // Same bound as the module's own introspection: the connection's
        // statementTimeout, so a big catalog can be given more than 30s (#1302).
        optionalNumber(config.statementTimeout),
      );

      const keyRows = await runBoundedQuery<KeyRow>(
        pool,
        KEYS_QUERY,
        optionalNumber(config.statementTimeout),
      );

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

      const tables: TableDef[] = Array.from(tableMap.entries()).map(
        ([name, columns]) => {
          const keys = keyRows.filter((k) => k.table_name === name);
          return {
            name,
            columns,
            primaryKey: keys.find((k) => k.contype === "p")?.columns ?? [],
            foreignKeys: keys
              .filter((k) => k.contype === "f")
              .map((k) => ({
                columns: k.columns,
                refTable: k.ref_table ?? "",
                refColumns: k.ref_columns ?? [],
              })),
          };
        },
      );

      return { type: "postgresql", tables };
    } finally {
      await pool.end();
    }
  }
}
