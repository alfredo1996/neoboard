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
  // Brand mark from simple-icons (siNeo4j), in its brand colour. The app shows it
  // as an <img>, never as DOM, so it is a whole SVG document (#1899).
  iconSvg:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4581C3"><path d="M9.629 13.227c-.593 0-1.139.2-1.58.533l-2.892-1.976a2.61 2.61 0 0 0 .101-.711 2.633 2.633 0 0 0-2.629-2.629A2.632 2.632 0 0 0 0 11.073a2.632 2.632 0 0 0 2.629 2.629c.593 0 1.139-.2 1.579-.533L7.1 15.145c-.063.226-.1.465-.1.711 0 .247.037.484.1.711l-2.892 1.976a2.608 2.608 0 0 0-1.579-.533A2.632 2.632 0 0 0 0 20.639a2.632 2.632 0 0 0 2.629 2.629 2.632 2.632 0 0 0 2.629-2.629c0-.247-.037-.485-.101-.711l2.892-1.976c.441.333.987.533 1.58.533a2.633 2.633 0 0 0 2.629-2.629c0-1.45-1.18-2.629-2.629-2.629ZM16.112.732c-4.72 0-7.888 2.748-7.888 8.082v3.802a3.525 3.525 0 0 1 3.071.008v-3.81c0-3.459 1.907-5.237 4.817-5.237s4.817 1.778 4.817 5.237v8.309H24V8.814C24 3.448 20.832.732 16.112.732Z"/></svg>',
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
