/**
 * PostgreSQL connector plugin.
 *
 * Registers PostgreSQL as a connector type. Uses the existing
 * PostgresConnectionModule for all connection/query operations.
 */

import type { ConnectorPlugin } from "../generalized/connector-plugin";
import type { AuthConfig } from "../generalized/interfaces";
import { PostgresConnectionModule } from "./PostgresConnectionModule";

export const postgresPlugin: ConnectorPlugin = {
  type: "postgresql",
  label: "PostgreSQL",
  category: "database",
  queryLanguage: "sql",
  supportsGraphData: false,
  supportsWrite: true,
  allowedProtocols: ["postgresql:", "postgres:"],
  uriPlaceholder: "postgresql://localhost:5432/mydb",
  databasePlaceholder: "postgres",

  createModule(
    authConfig: AuthConfig,
    advancedOptions?: Record<string, unknown>,
  ) {
    return new PostgresConnectionModule(authConfig, advancedOptions);
  },
};
