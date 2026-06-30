/**
 * PostgreSQL connector plugin.
 *
 * Registers PostgreSQL as a connector type. Uses the existing
 * PostgresConnectionModule for all connection/query operations.
 */

import type { ConnectorPlugin } from "@neoboard/connector-sdk";
import type { AuthConfig } from "@neoboard/connector-sdk";
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
  formFields: [
    {
      key: "uri",
      label: "Connection URI",
      type: "text",
      required: true,
      placeholder: "postgresql://localhost:5432/mydb",
      description: "PostgreSQL connection string",
    },
    {
      key: "database",
      label: "Database",
      type: "text",
      placeholder: "postgres",
      description: "Database name",
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "postgres",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
    },
  ],

  createModule(
    authConfig: AuthConfig,
    advancedOptions?: Record<string, unknown>,
  ) {
    return new PostgresConnectionModule(authConfig, advancedOptions);
  },
};
