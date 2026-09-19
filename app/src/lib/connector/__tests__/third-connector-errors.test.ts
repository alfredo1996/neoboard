import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map<string, string>()),
}));

import {
  ConnectorErrorType,
  registerConnector,
  unregisterConnector,
  type ConnectorPlugin,
} from "@neoboard/connection";
import {
  closeAllConnections,
  executeQuery,
  testConnection,
} from "@/lib/query/query-executor";
import { handleRouteError } from "@/lib/api/api-utils";
import { describeWriteError } from "@/lib/api/db-error-message";
import { connectionTestErrorResult } from "../connection-test-result";

/**
 * The proof the epic asks for (#1893, decision 8): a connector defined entirely
 * here, whose driver speaks a dialect nobody in `app/` has ever seen. Its
 * errors are RAW — it never wraps them — and they still come out of the app as
 * the right status, retry decision and words, because the app asks the
 * connector's own `classifyError` hook and recognises nothing itself (#1903).
 */
const FIXTURE_ERRORS: Record<string, string> = {
  "SELECT listener": "FX-0042 listener is not accepting sessions",
  "SELECT busy": "FX-0007 cursor pool exhausted",
  "SELECT typo": "FX-0900 unexpected token",
  "INSERT dup": "FX-2300 slot already taken",
};

const fixturePlugin: ConnectorPlugin = {
  type: "fixturedb",
  label: "FixtureDB",
  category: "database",
  fields: [],
  createModule: () =>
    ({
      checkConnection: async () => {
        throw new Error(FIXTURE_ERRORS["SELECT listener"]);
      },
      runQuery: (
        { query }: { query: string },
        callbacks: { onFail: (error: unknown) => void },
      ) => callbacks.onFail(new Error(FIXTURE_ERRORS[query])),
      close: async () => {},
      // The fixture only fails; the rest of the module contract is not needed.
    }) as unknown as ReturnType<ConnectorPlugin["createModule"]>,
  classifyError(err) {
    const code = (err as Error).message.slice(0, 7);
    if (code === "FX-0042") {
      return { type: ConnectorErrorType.NETWORK, transient: false };
    }
    if (code === "FX-0007") {
      return { type: ConnectorErrorType.CONNECTION, transient: true };
    }
    if (code === "FX-2300") {
      return {
        type: ConnectorErrorType.CONSTRAINT,
        transient: false,
        constraint: { kind: "unique" },
      };
    }
    return { type: ConnectorErrorType.QUERY, transient: false };
  },
};

const creds = {
  uri: "fixturedb://db.example.com:4242",
  username: "",
  password: "",
};

const failure = (query: string) =>
  executeQuery("fixturedb", creds, { query }).then(
    () => {
      throw new Error("expected the query to fail");
    },
    (error: unknown) => error,
  );

describe("a third connector's errors classify through ITS hook (#1903)", () => {
  beforeAll(() => registerConnector(fixturePlugin));
  afterAll(async () => {
    await closeAllConnections();
    unregisterConnector("fixturedb");
  });

  it("an unreachable host is a 502 with the network hint's reason", async () => {
    const res = await handleRouteError(await failure("SELECT listener"), "x");
    expect(res.status).toBe(502);
    expect((await res.json()).error.details).toEqual({ reason: "network" });
  });

  it("what it calls transient is retried: 408 + Retry-After", async () => {
    const res = await handleRouteError(await failure("SELECT busy"), "x");
    expect(res.status).toBe(408);
    expect(res.headers.get("Retry-After")).toBe("3");
  });

  it("what it calls permanent is a plain 500 with its message", async () => {
    const res = await handleRouteError(await failure("SELECT typo"), "x");
    expect(res.status).toBe(500);
    expect((await res.json()).error.message).toBe("FX-0900 unexpected token");
  });

  it("a constraint it names becomes the form's message", async () => {
    expect(describeWriteError(await failure("INSERT dup"))).toEqual({
      code: "CONFLICT",
      message: "A record with these values already exists.",
    });
  });

  it("a failed connection Test gets the code its verdict maps to", async () => {
    const thrown = await testConnection("fixturedb", creds).catch(
      (error: unknown) => error,
    );
    expect(connectionTestErrorResult(thrown)).toEqual({
      success: false,
      code: "network",
      error: "FX-0042 listener is not accepting sessions",
    });
  });
});
