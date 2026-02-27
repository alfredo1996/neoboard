import type { FieldDef } from 'pg';

/**
 * PostgreSQL Utility Functions
 */

export { errorHasMessage } from '../generalized/utils';

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
