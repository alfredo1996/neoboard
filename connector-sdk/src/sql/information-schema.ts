import type { ColumnDef, TableDef } from "../schema/types";
import type { SqlDialect } from "./lexer";
import { bindNamedParams } from "./named-params";

/** One column row, under the labels the walker's query gives it. */
export interface InformationSchemaColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

/** Runs one parameterised query on the connector's driver and resolves its rows. */
export type InformationSchemaRunner = (
  query: string,
  values: unknown[],
) => Promise<readonly InformationSchemaColumnRow[]>;

// Upper-case identifiers resolve in PostgreSQL, MySQL and case-sensitive SQL
// Server collations alike. The lowercase aliases fix the labels rows come back
// under, which MySQL 8 and SQL Server would otherwise upper-case.
const COLUMNS_QUERY = `
SELECT
  t.TABLE_NAME AS table_name,
  c.COLUMN_NAME AS column_name,
  c.DATA_TYPE AS data_type,
  c.IS_NULLABLE AS is_nullable
FROM INFORMATION_SCHEMA.TABLES t
JOIN INFORMATION_SCHEMA.COLUMNS c
  ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_SCHEMA = c.TABLE_SCHEMA
WHERE t.TABLE_SCHEMA = $param_schema AND t.TABLE_TYPE = 'BASE TABLE'
ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
`;

/**
 * The base tables of one schema with their columns in column order, read from
 * `information_schema`. The schema name is bound, never written into the SQL.
 * Views are left out: widgets query them, but they are not schema surface (#742).
 */
export async function walkInformationSchema(
  run: InformationSchemaRunner,
  { schema, dialect }: { schema: string; dialect: SqlDialect },
): Promise<TableDef[]> {
  const { query, values } = bindNamedParams(
    COLUMNS_QUERY,
    { param_schema: schema },
    dialect,
  );
  const tables = new Map<string, ColumnDef[]>();
  for (const row of await run(query, values)) {
    const columns = tables.get(row.table_name) ?? [];
    columns.push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES",
    });
    tables.set(row.table_name, columns);
  }
  return Array.from(tables, ([name, columns]) => ({ name, columns }));
}
