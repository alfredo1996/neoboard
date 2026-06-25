/**
 * PostgreSQL connector plugin.
 *
 * Registers PostgreSQL as a connector type. Uses the existing
 * PostgresConnectionModule for all connection/query operations.
 */

import type { ConnectorPlugin } from "@neoboard/connector-sdk";
import type { AuthConfig } from "@neoboard/connector-sdk";
import { PostgresConnectionModule } from "./PostgresConnectionModule";
import { postgresFormFields } from "../form-fields";

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
  formFields: postgresFormFields,

  createModule(
    authConfig: AuthConfig,
    advancedOptions?: Record<string, unknown>,
  ) {
    return new PostgresConnectionModule(authConfig, advancedOptions);
  },
};
