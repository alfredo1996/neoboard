import type {
  ConnectorDescriptor,
  ConnectorPlugin,
} from "@neoboard/connection";
// The SDK has no driver in it, so the jsdom form test can still load this file.
import {
  determineQueryStatus,
  type ConnectionModule,
} from "@neoboard/connector-sdk";

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

/**
 * The rows the fixture's workbook holds, in the canonical row shape (#1904):
 * plain objects keyed by column.
 */
export const FIXTURE_ROWS = [
  { sheet: "Q1", total: 10 },
  { sheet: "Q2", total: 20 },
  { sheet: "Q3", total: 30 },
];

/** What reached the fixture's `runQuery`, newest last: the text, the params, the config. */
export const fixtureRuns: {
  query: string;
  params?: Record<string, unknown>;
  config: { rowLimit: number; accessMode?: string };
}[] = [];

/**
 * An in-memory module (#1948): no driver, no socket, the same contract the
 * built-ins meet. It reads at most `rowLimit + 1` rows — the MAX_ROWS+1 probe —
 * and says whether there were more, never touching the query text. A plain
 * object, because `ConnectionModule` is a class this file must not import.
 */
function fixtureModule() {
  return {
    authModule: {},
    async runQuery(
      queryParams: { query: string; params?: Record<string, unknown> },
      callbacks: {
        onSuccess?: (rows: unknown) => void;
        setStatus?: (status: unknown) => void;
      },
      config: { rowLimit: number; accessMode?: string },
    ) {
      fixtureRuns.push({ ...queryParams, config });
      const read = FIXTURE_ROWS.slice(0, config.rowLimit + 1);
      callbacks.setStatus?.(determineQueryStatus(read.length, config.rowLimit));
      callbacks.onSuccess?.(read.slice(0, config.rowLimit));
    },
    async checkConnection() {
      return true;
    },
    async listDatabases() {
      return [];
    },
    async close() {},
  } as unknown as ConnectionModule;
}

/** The same connector as a registrable plugin: it connects, in memory. */
export const fixtureConnector = {
  ...fixtureDescriptor,
  createModule: fixtureModule,
  createSchemaManager: () => {
    throw new Error("never introspected");
  },
} as ConnectorPlugin;

/** Secret values the tests plant, to assert they never come back out. */
export const FIXTURE_SECRETS = {
  apiToken: "tok-3f9a-never-echoed",
  signingSecret: "sig-77c1-never-echoed",
};
