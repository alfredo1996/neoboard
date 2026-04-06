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

  createModule(
    authConfig: AuthConfig,
    advancedOptions?: Record<string, unknown>,
  ) {
    return new Neo4jConnectionModule(authConfig, advancedOptions);
  },
};
