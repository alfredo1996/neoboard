/**
 * Neo4j connector plugin — the descriptor plus the factories that need the
 * driver. Everything Neo4j IS lives in `descriptor.ts`.
 */

import type { ConnectorPlugin } from "@neoboard/connector-sdk";
import { neo4jDescriptor } from "./descriptor";
import { Neo4jConnectionModule } from "./Neo4jConnectionModule";
import { Neo4jSchemaManager } from "../schema/neo4j-schema";

export const neo4jPlugin: ConnectorPlugin = {
  ...neo4jDescriptor,

  createModule(config) {
    return new Neo4jConnectionModule(config);
  },

  createSchemaManager() {
    return new Neo4jSchemaManager();
  },
};
