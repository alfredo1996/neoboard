import { PostgresConnectionModule } from "../postgresql/PostgresConnectionModule";
import { runBoundedQuery } from "../postgresql/utils";
import type {
  AuthConfig,
  ColumnDef,
  DatabaseSchema,
  PostgresAdvancedOptions,
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
  async fetchSchema(
    authConfig: AuthConfig,
    advancedOptions?: PostgresAdvancedOptions,
  ): Promise<DatabaseSchema> {
    const module = new PostgresConnectionModule(authConfig, advancedOptions);
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
        advancedOptions?.pgIntrospectionTimeoutMillis,
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
        ([name, columns]) => ({
          name,
          columns,
        }),
      );

      return { type: "postgresql", tables };
    } finally {
      await pool.end();
    }
  }
}
