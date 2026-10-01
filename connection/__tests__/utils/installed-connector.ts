/**
 * What neoboard-connectors.json installs, as the docs' plugin template writes
 * it (extend/new-connector-plugin.mdx): advanced fields with placeholders and
 * no `classifyError` hook. A suite that mocks the generated list with this one
 * holds with a connector installed beside the built-ins (#2063):
 *
 *   jest.mock("../src/external-connectors.generated", () =>
 *     jest.requireActual("./utils/installed-connector"),
 *   );
 */
import { poolSizeField, timeoutField, uriField } from "@neoboard/connector-sdk";
import type { ExternalConnectorEntry } from "../../src/external-connectors.generated";

export const EXTERNAL_CONNECTORS: ExternalConnectorEntry[] = [
  {
    overrides: false,
    plugin: {
      type: "mydb",
      label: "MyDB",
      category: "database",
      fields: [
        uriField({
          placeholder: "mydb://localhost:5555",
          protocols: ["mydb:"],
        }),
        poolSizeField("10"),
        timeoutField("queryTimeout", "Query Timeout", "30000"),
      ],
      createModule: () => {
        throw new Error("never connected");
      },
    },
  },
];
