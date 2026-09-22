import type {
  ConnectorDescriptor,
  ConnectorPlugin,
} from "@neoboard/connection";

/**
 * A third connector nothing in `app/` has ever heard of (#1901, epic #1893).
 *
 * It exists to prove the connection form, the connections routes and the
 * secret handling are driven by the descriptor alone: its keys match no
 * built-in connector's, it has TWO secrets (one of them advanced), a select, a
 * boolean and a number with bounds and a unit. Type-only imports on purpose —
 * the jsdom form test loads this file and must not pull in a database driver.
 */
export const fixtureDescriptor: ConnectorDescriptor = {
  type: "acme-sheets",
  label: "Acme Sheets",
  category: "file",
  queryLanguage: "acmeql",
  supportsWrite: false,
  fields: [
    {
      key: "endpoint",
      label: "Endpoint",
      type: "uri",
      group: "connection",
      required: true,
      placeholder: "acme://host/book",
      protocols: ["acme:"],
    },
    {
      key: "apiToken",
      label: "API Token",
      type: "password",
      group: "connection",
      required: true,
    },
    {
      key: "region",
      label: "Region",
      type: "select",
      group: "connection",
      description: "Where the workbook is hosted.",
      options: [
        { label: "Europe", value: "eu" },
        { label: "United States", value: "us" },
      ],
    },
    {
      key: "pageSize",
      label: "Page Size",
      type: "number",
      group: "advanced",
      placeholder: "100",
      min: 1,
      max: 500,
      unit: "rows",
    },
    {
      key: "signingSecret",
      label: "Signing Secret",
      type: "password",
      group: "advanced",
    },
    {
      key: "verifyTls",
      label: "Verify TLS",
      type: "boolean",
      group: "advanced",
    },
  ],
};

/** The same connector as a registrable plugin. It never connects. */
export const fixtureConnector = {
  ...fixtureDescriptor,
  createModule: () => {
    throw new Error("never connected");
  },
  createSchemaManager: () => {
    throw new Error("never introspected");
  },
} as ConnectorPlugin;

/** Secret values the tests plant, to assert they never come back out. */
export const FIXTURE_SECRETS = {
  apiToken: "tok-3f9a-never-echoed",
  signingSecret: "sig-77c1-never-echoed",
};
