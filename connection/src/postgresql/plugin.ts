/**
 * PostgreSQL connector plugin — the descriptor plus the factories that need
 * the driver. Everything PostgreSQL IS lives in `descriptor.ts`.
 */

import type { ConnectorPlugin } from "@neoboard/connector-sdk";
import { postgresDescriptor } from "./descriptor";
import { PostgresConnectionModule } from "./PostgresConnectionModule";
import { PostgresSchemaManager } from "../schema/pg-schema";
import { classifyPostgresError } from "./classify-error";

export const postgresPlugin: ConnectorPlugin = {
  ...postgresDescriptor,

  createModule(config) {
    return new PostgresConnectionModule(config);
  },

  createSchemaManager() {
    return new PostgresSchemaManager();
  },

  classifyError: classifyPostgresError,
};
