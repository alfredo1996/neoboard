import { PostgresConnectionModule } from "../postgresql/PostgresConnectionModule";
import type { AuthConfig, DatabaseSchema } from "@neoboard/connector-sdk";
import {
  walkInformationSchema,
  type InformationSchemaColumnRow,
} from "@neoboard/connector-sdk/sql";
import type { SchemaManager } from "./schema-manager";

/**
 * Fetches schema information from a PostgreSQL database: the base tables of
 * the public schema and their columns, through the information_schema walker
 * every SQL connector shares (#1698).
 */
export class PostgresSchemaManager implements SchemaManager {
  async fetchSchema(authConfig: AuthConfig): Promise<DatabaseSchema> {
    const module = new PostgresConnectionModule(authConfig);
    const pool = module.getPool();

    if (!pool) {
      throw new Error("Failed to create PostgreSQL connection pool");
    }

    // pool.end() must run even if pool.connect() itself throws (bad creds,
    // unreachable host) — otherwise every failed introspection leaks a Pool
    // with its idle timers and error listener. So connect() lives inside the
    // try whose finally ends the pool. (#MEDIUM)
    try {
      const client = await pool.connect();
      try {
        const tables = await walkInformationSchema(
          async (query, values) =>
            (await client.query<InformationSchemaColumnRow>(query, values))
              .rows,
          { schema: "public", dialect: "postgres" },
        );
        return { type: "postgresql", tables };
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  }
}
