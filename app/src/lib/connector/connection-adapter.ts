/**
 * Re-exports connection package symbols used by the app.
 *
 * This thin adapter isolates the @neoboard/connection import so that
 * query-executor.ts remains fully mockable in tests (vi.mock("./connection-adapter", …)).
 */

import {
  createConnectionModule,
  DEFAULT_CONNECTION_CONFIG,
  ConnectionTypes,
  getSchemaManager,
  getConnector,
  getAllConnectors,
} from "@neoboard/connection";

export {
  createConnectionModule,
  DEFAULT_CONNECTION_CONFIG,
  ConnectionTypes,
  getSchemaManager,
  getConnector,
  getAllConnectors,
};
