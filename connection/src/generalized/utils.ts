import { QueryStatus } from './interfaces';

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
  return typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string';
}

/**
 * Determines the query status based on row count and row limit.
 * Shared by both Neo4j and PostgreSQL connection modules.
 */
export function determineQueryStatus(rowCount: number, rowLimit: number): QueryStatus {
  if (rowCount === 0) return QueryStatus.NO_DATA;
  if (rowCount > rowLimit) return QueryStatus.COMPLETE_TRUNCATED;
  return QueryStatus.COMPLETE;
}
