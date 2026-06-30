import type { AuthConfig } from "@neoboard/connector-sdk";
import type { DatabaseSchema } from "@neoboard/connector-sdk";

export interface SchemaManager {
  fetchSchema(authConfig: AuthConfig): Promise<DatabaseSchema>;
}
