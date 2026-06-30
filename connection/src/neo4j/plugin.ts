/**
 * Neo4j connector plugin.
 *
 * Registers Neo4j as a connector type. Uses the existing
 * Neo4jConnectionModule for all connection/query operations.
 */

import type { ConnectorPlugin } from "@neoboard/connector-sdk";
import type { AuthConfig } from "@neoboard/connector-sdk";
import { Neo4jConnectionModule } from "./Neo4jConnectionModule";
import { Neo4jSchemaManager } from "../schema/neo4j-schema";
import { neo4jFormFields } from "../form-fields";
import { CONNECTOR_QUERY_LANGUAGES } from "../query-languages";

export const neo4jPlugin: ConnectorPlugin = {
  type: "neo4j",
  label: "Neo4j",
  category: "graph",
  queryLanguage: CONNECTOR_QUERY_LANGUAGES.neo4j,
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
  formFields: neo4jFormFields,

  createModule(
    authConfig: AuthConfig,
    advancedOptions?: Record<string, unknown>,
  ) {
    return new Neo4jConnectionModule(authConfig, advancedOptions);
  },

  createSchemaManager() {
    return new Neo4jSchemaManager();
  },
};
