/**
 * Re-exports connection package symbols used by the app.
 *
 * This thin adapter isolates the @neoboard/connection import so that
 * query-executor.ts remains fully mockable in tests (vi.mock("./connection-adapter", …)).
 */

export {
  createConnectionModule,
  DEFAULT_CONNECTION_CONFIG,
  getSchemaManager,
  getConnector,
  toConnectorError,
} from "@neoboard/connection";
