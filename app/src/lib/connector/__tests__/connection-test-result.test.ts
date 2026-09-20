import { describe, it, expect } from "vitest";
import { ConnectorError, ConnectorErrorType } from "@neoboard/connection";
import {
  connectionCheckFalseResult,
  connectionTestErrorResult,
} from "../connection-test-result";

/** What `testConnection` throws: the connector's error, classified by its own hook. */
const raised = (type: ConnectorErrorType, message = "the driver's own words") =>
  new ConnectorError(message, type);

describe("connection-test-result (#1043)", () => {
  it("builds an actionable false result with code unknown", () => {
    const r = connectionCheckFalseResult();
    expect(r.success).toBe(false);
    expect(r.code).toBe("unknown");
    expect(r.error).not.toMatch(/check returned false/i);
    expect(r.error).toMatch(/verify the host, port, credentials/i);
  });

  it.each([
    [ConnectorErrorType.NETWORK, "network"],
    [ConnectorErrorType.AUTHENTICATION, "auth_failed"],
    [ConnectorErrorType.BAD_URI, "bad_uri"],
    [ConnectorErrorType.QUERY, "unknown"],
  ])("codes a thrown %s error as %s, and keeps its message", (type, code) => {
    expect(connectionTestErrorResult(raised(type))).toEqual({
      success: false,
      code,
      error: "the driver's own words",
    });
  });

  it("is `unknown` for an error no connector classified", () => {
    expect(connectionTestErrorResult(new Error("anything")).code).toBe(
      "unknown",
    );
  });

  it("falls back for a non-Error throw", () => {
    const r = connectionTestErrorResult("boom");
    expect(r.success).toBe(false);
    expect(r.code).toBe("unknown");
    expect(r.error).toBe("Connection test failed");
  });

  // The URI has to reach the code for it to spot a Docker networking miss —
  // the route already has it, and passing it is the whole wiring (#1346).
  it("passes the URI and container flag through", () => {
    expect(
      connectionTestErrorResult(raised(ConnectorErrorType.NETWORK), {
        uri: "fixturedb://localhost:7688",
        containerised: true,
      }).code,
    ).toBe("container_loopback");
  });

  it("still codes as network when no context is given", () => {
    // Both call sites must keep working unchanged if the context is absent.
    expect(
      connectionTestErrorResult(raised(ConnectorErrorType.NETWORK)).code,
    ).toBe("network");
  });

  it("never echoes the URI into the user-facing error", () => {
    // A URI can carry a password. The code is derived from it; the result must
    // not carry it back out.
    const r = connectionTestErrorResult(raised(ConnectorErrorType.NETWORK), {
      uri: "fixturedb://admin:hunter2@localhost:5432/app",
      containerised: true,
    });
    expect(JSON.stringify(r)).not.toContain("hunter2");
    expect(JSON.stringify(r)).not.toContain("localhost:5432");
  });

  it("strips a credential the driver quoted in its message", () => {
    const r = connectionTestErrorResult(
      raised(
        ConnectorErrorType.NETWORK,
        "refused by fixturedb://admin:hunter2@db.internal:5432/app",
      ),
    );
    expect(r.error).not.toContain("hunter2");
  });
});
