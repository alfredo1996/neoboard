import type { ConnectorPlugin, QueryStatus } from "@neoboard/connection";
import type { ConnectionModule } from "@neoboard/connector-sdk";

/**
 * A connector whose every query does what the test scripts (#2060): answer
 * with more rows than it was allowed, answer late, or never answer at all.
 * The app's backstops exist for a third-party connector that breaks its
 * contract, so this one breaks it on demand. In memory, no driver.
 */
export interface ScriptedCallbacks {
  onSuccess?: (result: unknown) => void;
  onFail?: (error: unknown) => void;
  setStatus?: (status: QueryStatus) => void;
}

export type Script = (
  callbacks: ScriptedCallbacks,
  config: { rowLimit: number },
) => void;

export const SCRIPTED_TYPE = "scripted-stub";

/**
 * What the next query does, what the next connection probe does, and what the
 * next database or schema list does. Tests set them; the default query never
 * answers, the default probe passes, the default list is empty.
 */
export const scripted: {
  script: Script;
  check: () => Promise<boolean>;
  list: () => Promise<string[]>;
} = {
  script: () => {},
  check: async () => true,
  list: async () => [],
};

const waiting: ((callbacks: ScriptedCallbacks) => void)[] = [];

/**
 * Resolves with the callbacks the connector is handed on its next query, once
 * the script has run. Call it BEFORE starting the query.
 */
export function nextRun(): Promise<ScriptedCallbacks> {
  return new Promise((resolve) => waiting.push(resolve));
}

/** `count` distinct rows. */
export const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ i }));

export const scriptedConnector = {
  type: SCRIPTED_TYPE,
  label: "Scripted Stub",
  category: "api",
  fields: [
    // A millisecond duration: a timeout the connector may run under.
    {
      key: "callTimeout",
      label: "Call Timeout",
      type: "number",
      group: "advanced",
      unit: "ms",
    },
    // A number that is not a duration.
    {
      key: "pageSize",
      label: "Page Size",
      type: "number",
      group: "advanced",
      unit: "rows",
    },
  ],
  createModule: () =>
    ({
      authModule: {},
      async runQuery(
        _query: unknown,
        callbacks: ScriptedCallbacks,
        config: { rowLimit: number },
      ) {
        scripted.script(callbacks, config);
        for (const resolve of waiting.splice(0)) resolve(callbacks);
      },
      checkConnection: () => scripted.check(),
      listDatabases: () => scripted.list(),
      listSchemas: () => scripted.list(),
      async close() {},
    }) as unknown as ConnectionModule,
} as ConnectorPlugin;
