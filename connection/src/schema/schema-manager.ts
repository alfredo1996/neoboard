// The SchemaManager contract now lives in @neoboard/connector-sdk (#1119) so
// external connectors can implement it. Re-exported here to keep the existing
// `./schema-manager` import path stable for the built-in managers.
export type { SchemaManager } from "@neoboard/connector-sdk";
