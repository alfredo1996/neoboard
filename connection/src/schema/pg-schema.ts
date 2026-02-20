import { PostgresConnectionModule } from '../postgresql/PostgresConnectionModule';
import type { AuthConfig } from '../generalized/interfaces';
import type { SchemaManager } from './schema-manager';
import type { DatabaseSchema, TableDef, ColumnDef } from './types';

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
  async fetchSchema(authConfig: AuthConfig): Promise<DatabaseSchema> {
    const module = new PostgresConnectionModule(authConfig);
    const pool = module.getPool();

    if (!pool) {
      throw new Error('Failed to create PostgreSQL connection pool');
    }

    const client = await pool.connect();
    try {
      const result = await client.query<SchemaRow>(SCHEMA_QUERY);

      const tableMap = new Map<string, ColumnDef[]>();
      for (const row of result.rows) {
        let columns = tableMap.get(row.table_name);
        if (!columns) {
          columns = [];
          tableMap.set(row.table_name, columns);
        }
        columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
        });
      }

      const tables: TableDef[] = Array.from(tableMap.entries()).map(([name, columns]) => ({
        name,
        columns,
      }));

      return { type: 'postgresql', tables };
    } finally {
      client.release();
      await pool.end();
    }
  }
}
