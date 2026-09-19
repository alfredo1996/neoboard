/**
 * Neo4j connector descriptor — everything the Neo4j connector IS, as data.
 *
 * Imports only the SDK (its pure field builders; the SDK depends on nothing),
 * on purpose: this file must stay safe to bundle for the browser, so it may
 * never pull in neo4j-driver. `plugin.ts` adds the factories that do.
 *
 * Field keys are the STORED config keys. Renaming one is a data migration.
 * Placeholders are the connection form's own, carried over unchanged; they are
 * never applied as values — the defaults live in Neo4jAuthenticationModule.
 * Two of them are stale (queryTimeout's real default is 30000, and
 * connectionAcquisitionTimeout's is connectionTimeout + 5000): #1920.
 */

import {
  databaseField,
  passwordField,
  poolSizeField,
  timeoutField,
  uriField,
  usernameField,
  type ConnectorDescriptor,
} from "@neoboard/connector-sdk";

export const neo4jDescriptor: ConnectorDescriptor = {
  type: "neo4j",
  label: "Neo4j",
  category: "graph",
  queryLanguage: "cypher",
  supportsGraphData: true,
  supportsWrite: true,
  fields: [
    uriField({
      placeholder: "bolt://localhost:7687",
      protocols: [
        "neo4j:",
        "neo4j+s:",
        "neo4j+ssc:",
        "bolt:",
        "bolt+s:",
        "bolt+ssc:",
      ],
    }),
    usernameField("neo4j"),
    passwordField(),
    databaseField({
      placeholder: "neo4j (default)",
      description: "Database name (leave empty for default).",
    }),
    timeoutField("connectionTimeout", "Connection Timeout", "30000"),
    timeoutField("queryTimeout", "Query Timeout", "2000"),
    poolSizeField("100"),
    timeoutField(
      "connectionAcquisitionTimeout",
      "Acquisition Timeout",
      "60000",
    ),
  ],
};
