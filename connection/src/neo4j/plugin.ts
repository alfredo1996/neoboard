/**
 * Neo4j connector plugin.
 *
 * Registers Neo4j as a connector type. Uses the existing
 * Neo4jConnectionModule for all connection/query operations.
 */

import type { ConnectorPlugin } from "../generalized/connector-plugin";
import type { AuthConfig } from "../generalized/interfaces";
import { Neo4jConnectionModule } from "./Neo4jConnectionModule";

export const neo4jPlugin: ConnectorPlugin = {
  type: "neo4j",
  label: "Neo4j",
  category: "graph",
  queryLanguage: "cypher",
  supportsGraphData: true,
  supportsWrite: true,
  allowedProtocols: [
    "neo4j:",
    "neo4j+s:",
    "neo4j+ssc:",
    "bolt:",
    "bolt+s:",
    "bolt+ssc:",
  ],
  uriPlaceholder: "bolt://localhost:7687",
  databasePlaceholder: "neo4j",
  formFields: [
    {
      key: "uri",
      label: "Connection URI",
      type: "text",
      required: true,
      placeholder: "bolt://localhost:7687",
      description: "Neo4j connection URI",
    },
    {
      key: "database",
      label: "Database",
      type: "text",
      placeholder: "neo4j",
      description: "Database name (leave empty for default)",
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "neo4j",
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
    return new Neo4jConnectionModule(authConfig, advancedOptions);
  },
};
