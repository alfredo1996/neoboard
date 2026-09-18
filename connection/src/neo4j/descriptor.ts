/**
 * Neo4j connector descriptor — everything the Neo4j connector IS, as data.
 *
 * Type-only imports, on purpose: this file must stay safe to bundle for the
 * browser, so it may never pull in neo4j-driver. `plugin.ts` adds the
 * factories that do.
 *
 * Field keys are the STORED config keys. Renaming one is a data migration.
 * Placeholders are the connection form's own, carried over unchanged; they are
 * never applied as values — the defaults live in Neo4jAuthenticationModule.
 * Two of them are stale (queryTimeout's real default is 30000, and
 * connectionAcquisitionTimeout's is connectionTimeout + 5000): #1920.
 */

import type { ConnectorDescriptor } from "@neoboard/connector-sdk";

export const neo4jDescriptor: ConnectorDescriptor = {
  type: "neo4j",
  label: "Neo4j",
  category: "graph",
  queryLanguage: "cypher",
  supportsGraphData: true,
  supportsWrite: true,
  fields: [
    {
      key: "uri",
      label: "URI",
      type: "uri",
      group: "connection",
      required: true,
      placeholder: "bolt://localhost:7687",
      protocols: [
        "neo4j:",
        "neo4j+s:",
        "neo4j+ssc:",
        "bolt:",
        "bolt+s:",
        "bolt+ssc:",
      ],
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      group: "connection",
      required: true,
      placeholder: "neo4j",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      group: "connection",
      required: true,
    },
    {
      key: "database",
      label: "Database",
      type: "text",
      group: "connection",
      placeholder: "neo4j (default)",
      description: "Database name (leave empty for default).",
    },
    {
      key: "connectionTimeout",
      label: "Connection Timeout",
      type: "number",
      group: "advanced",
      placeholder: "30000",
      min: 1000,
      max: 300_000,
      unit: "ms",
    },
    {
      key: "queryTimeout",
      label: "Query Timeout",
      type: "number",
      group: "advanced",
      placeholder: "2000",
      min: 1000,
      max: 300_000,
      unit: "ms",
    },
    {
      key: "maxPoolSize",
      label: "Max Pool Size",
      type: "number",
      group: "advanced",
      placeholder: "100",
      min: 1,
      max: 100,
    },
    {
      key: "connectionAcquisitionTimeout",
      label: "Acquisition Timeout",
      type: "number",
      group: "advanced",
      placeholder: "60000",
      min: 1000,
      max: 300_000,
      unit: "ms",
    },
  ],
};
