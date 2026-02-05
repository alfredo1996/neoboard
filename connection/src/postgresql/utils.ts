import type { FieldDef } from 'pg';

/**
 * PostgreSQL Utility Functions
 */

/**
 * Type guard that checks whether a given value is an object
 * containing a `message` property of type string.
 *
 * This is typically used to safely handle and inspect thrown errors.
 *
 * @param {unknown} err - The value to check.
 * @returns {boolean} True if the value is an object with a string `message` property.
 */
export function errorHasMessage(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err && typeof (err as any).message === 'string';
}

/**
 * Extracts schema information from PostgreSQL field metadata.
 * Similar to Neo4j's extractNodeAndRelPropertiesFromRecords but for relational data.
 *
 * @param fields - PostgreSQL field metadata from query result
 * @returns Array of [tableName, field1, field2, ...] arrays, or empty array
 */
export function extractTableSchemaFromFields(fields: FieldDef[]): string[][] {
  if (!fields || fields.length === 0) {
    return [];
  }

  // Group fields by table (using table OID)
  const tableDict: Record<string, Set<string>> = {};

  fields.forEach((field) => {
    // Use table name if available, otherwise use a generic key
    const tableName = field.name ? 'result' : 'unknown';

    if (!tableDict[tableName]) {
      tableDict[tableName] = new Set();
    }

    tableDict[tableName].add(field.name);
  });

  // Convert to array format: [tableName, ...fieldNames]
  const schema = Object.keys(tableDict).map((tableName) => {
    return [tableName, ...Array.from(tableDict[tableName])];
  });

  return schema.length > 0 ? schema : [];
}

/**
 * Detects if a PostgreSQL error is a timeout error.
 * @param error - The error object
 * @returns true if the error is a timeout
 */
export function isTimeoutError(error: any): boolean {
  if (!error) return false;

  const message = error.message || '';
  const code = error.code || '';

  // PostgreSQL timeout error codes and messages
  return (
    code === '57014' || // query_canceled
    code === '57P01' || // admin_shutdown
    message.includes('timeout') ||
    message.includes('canceling statement due to statement timeout') ||
    message.includes('terminating connection due to administrator command')
  );
}

/**
 * Checks if an error is an authentication error.
 * @param error - The error object
 * @returns true if the error is an authentication issue
 */
export function isAuthenticationError(error: any): boolean {
  if (!error) return false;

  const code = error.code || '';

  // PostgreSQL authentication error codes
  return (
    code === '28P01' || // invalid_password
    code === '28000' || // invalid_authorization_specification
    code === '28001' || // invalid_password (GSSAPI)
    code === '3D000'    // invalid_catalog_name (database doesn't exist)
  );
}

/**
 * Escapes a PostgreSQL identifier (table name, column name, etc).
 * @param identifier - The identifier to escape
 * @returns Escaped identifier wrapped in double quotes
 */
export function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Converts a JavaScript value to a PostgreSQL literal string.
 * @param value - The value to convert
 * @returns PostgreSQL literal representation
 */
export function toPgLiteral(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  if (Array.isArray(value)) {
    const elements = value.map(v => toPgLiteral(v)).join(',');
    return `ARRAY[${elements}]`;
  }

  if (typeof value === 'object') {
    return `'${JSON.stringify(value)}'::jsonb`;
  }

  return String(value);
}

/**
 * Parses a PostgreSQL connection string.
 * @param connectionString - PostgreSQL connection URI
 * @returns Parsed connection object
 */
export function parseConnectionString(connectionString: string): {
  user?: string;
  password?: string;
  host: string;
  port: number;
  database: string;
} {
  try {
    const url = new URL(connectionString);
    return {
      user: url.username || undefined,
      password: url.password || undefined,
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      database: url.pathname.slice(1) || 'postgres',
    };
  } catch (error) {
    throw new Error(`Invalid PostgreSQL connection string: ${connectionString}`);
  }
}

/**
 * Generates a simple SELECT query from table name and optional WHERE clause.
 * @param tableName - The table to query
 * @param limit - Maximum rows to return
 * @param whereClause - Optional WHERE condition
 * @returns SELECT query string
 */
export function buildSimpleSelectQuery(
  tableName: string,
  limit: number = 100,
  whereClause?: string
): string {
  const escaped = escapeIdentifier(tableName);
  let query = `SELECT * FROM ${escaped}`;
  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }
  query += ` LIMIT ${limit}`;
  return query;
}

/**
 * Gets a list of all tables in the current database.
 * @returns PostgreSQL query to fetch table names
 */
export function getTablesQuery(): string {
  return `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
}

/**
 * Gets columns for a specific table.
 * @param tableName - The table to inspect
 * @returns PostgreSQL query to fetch column information
 */
export function getTableColumnsQuery(tableName: string): string {
  return `
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_name = '${tableName.replace(/'/g, "''")}'
    ORDER BY ordinal_position
  `;
}

/**
 * Gets indexes for a specific table.
 * @param tableName - The table to inspect
 * @returns PostgreSQL query to fetch index information
 */
export function getTableIndexesQuery(tableName: string): string {
  return `
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = '${tableName.replace(/'/g, "''")}'
  `;
}

/**
 * PostgreSQL OID constants for common types.
 */
export const PG_TYPES = {
  BOOL: 16,
  INT2: 21,
  INT4: 23,
  INT8: 20,
  FLOAT4: 700,
  FLOAT8: 701,
  NUMERIC: 1700,
  TEXT: 25,
  VARCHAR: 1043,
  CHAR: 1042,
  DATE: 1082,
  TIME: 1083,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  JSON: 114,
  JSONB: 3802,
  UUID: 2950,
  BYTEA: 17,
} as const;
