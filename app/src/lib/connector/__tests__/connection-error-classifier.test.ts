import { describe, it, expect } from "vitest";
import {
  ConnectorError,
  ConnectorErrorType,
  getAllConnectors,
  toDescriptor,
  type ConnectorDescriptor,
} from "@neoboard/connection";
import {
  classificationOf,
  connectionErrorCode,
  connectorUnavailableReason,
  hintForConnectionErrorCode,
  type ConnectionErrorCode,
} from "../connection-error-classifier";

/** An error as any connector raises it: classified, its message opaque to the app. */
const raised = (type: ConnectorErrorType) =>
  new ConnectorError("the driver's own words", type);

describe("classificationOf", () => {
  it("reads the classification a connector attached", () => {
    expect(classificationOf(raised(ConnectorErrorType.NETWORK))).toEqual({
      type: "NETWORK",
      transient: false,
    });
  });

  it("recognises a ConnectorError from another copy of the SDK by name", () => {
    const classification = { type: "TIMEOUT", transient: true };
    const foreign = Object.assign(new Error("x"), {
      name: "ConnectorError",
      classification,
    });
    expect(classificationOf(foreign)).toBe(classification);
  });

  it.each([
    ["a plain Error", new Error("x")],
    [
      "a plain Error that merely carries the field",
      Object.assign(new Error("x"), { classification: { type: "NETWORK" } }),
    ],
    ["a string", "x"],
    ["null", null],
  ])("is undefined for %s — only a connector classifies", (_label, error) => {
    expect(classificationOf(error)).toBeUndefined();
  });
});

describe("connectionErrorCode — category to Test-result code", () => {
  it.each([
    [ConnectorErrorType.BAD_URI, "bad_uri"],
    [ConnectorErrorType.AUTHENTICATION, "auth_failed"],
    [ConnectorErrorType.NETWORK, "network"],
    [ConnectorErrorType.CONNECTION, "unknown"],
    [ConnectorErrorType.TIMEOUT, "unknown"],
    [ConnectorErrorType.QUERY, "unknown"],
    [ConnectorErrorType.CONSTRAINT, "unknown"],
    [ConnectorErrorType.READ_ONLY_VIOLATION, "unknown"],
    [ConnectorErrorType.UNKNOWN, "unknown"],
  ])("%s is %s", (type, code) => {
    expect(connectionErrorCode(raised(type))).toBe(code);
  });

  it("is unknown for an error no connector classified", () => {
    expect(connectionErrorCode(new Error("anything"))).toBe("unknown");
    expect(connectionErrorCode("boom")).toBe("unknown");
  });
});

describe("connectorUnavailableReason — what marks a connector dead", () => {
  it.each([
    [ConnectorErrorType.NETWORK, "network"],
    [ConnectorErrorType.AUTHENTICATION, "auth_failed"],
  ])("%s is unavailable: %s", (type, reason) => {
    expect(connectorUnavailableReason(raised(type))).toBe(reason);
  });

  it.each([
    ConnectorErrorType.BAD_URI,
    ConnectorErrorType.CONNECTION,
    ConnectorErrorType.TIMEOUT,
    ConnectorErrorType.QUERY,
    ConnectorErrorType.CONSTRAINT,
    ConnectorErrorType.READ_ONLY_VIOLATION,
    ConnectorErrorType.UNKNOWN,
  ])("%s proves the connector answered", (type) => {
    expect(connectorUnavailableReason(raised(type))).toBeUndefined();
  });

  it("ignores an error that did not come from a connector", () => {
    // handleRouteError catches for every route; NeoBoard's own database being
    // down must not be blamed on the user's connector.
    expect(connectorUnavailableReason(new Error("anything"))).toBeUndefined();
  });
});

describe("hintForConnectionErrorCode", () => {
  const ALL: ConnectionErrorCode[] = [
    "auth_failed",
    "network",
    "bad_uri",
    "container_loopback",
    "unknown",
  ];

  it.each(ALL)("returns a non-empty user-facing hint for %s", (code) => {
    const hint = hintForConnectionErrorCode(code);
    expect(hint).toBeTruthy();
    expect(hint.length).toBeGreaterThan(10);
  });

  it("auth_failed hint mentions username/password", () => {
    expect(hintForConnectionErrorCode("auth_failed").toLowerCase()).toMatch(
      /username|password|credential/,
    );
  });

  it("network hint mentions host/firewall/server", () => {
    expect(hintForConnectionErrorCode("network").toLowerCase()).toMatch(
      /host|firewall|server|reachable|port/,
    );
  });

  it("bad_uri hint mentions scheme/URI/format", () => {
    expect(hintForConnectionErrorCode("bad_uri").toLowerCase()).toMatch(
      /uri|scheme|format/,
    );
  });

  // Every name a registered connector goes by: its type, its label, its URI
  // schemes. Read off the registry, so connector N+1 is covered from birth.
  const connectorNames = getAllConnectors().flatMap((c) => [
    c.type,
    c.label,
    ...c.fields
      .flatMap((f) => f.protocols ?? [])
      .map((p) => p.split(/[+:]/)[0]),
  ]);

  it.each(ALL)("the %s hint names no connector", (code) => {
    const hint = hintForConnectionErrorCode(code).toLowerCase();
    expect(connectorNames.length).toBeGreaterThan(0);
    for (const name of connectorNames) {
      expect(hint).not.toContain(name.toLowerCase());
    }
  });

  describe("examples come from the connector's own descriptor", () => {
    const fixture: ConnectorDescriptor = {
      type: "fixturedb",
      label: "FixtureDB",
      category: "database",
      fields: [
        {
          key: "uri",
          label: "URI",
          type: "uri",
          group: "connection",
          protocols: ["fixturedb:"],
          placeholder: "fixturedb://localhost:4242",
        },
        {
          key: "username",
          label: "Username",
          type: "text",
          group: "connection",
          placeholder: "fixture_admin",
        },
      ],
    };

    it("bad_uri shows the URI field's placeholder", () => {
      expect(hintForConnectionErrorCode("bad_uri", fixture)).toContain(
        "fixturedb://localhost:4242",
      );
    });

    it("auth_failed shows the username field's placeholder", () => {
      expect(hintForConnectionErrorCode("auth_failed", fixture)).toContain(
        "fixture_admin",
      );
    });

    it.each(getAllConnectors().map((c) => [c.type, toDescriptor(c)] as const))(
      "%s gets its own examples",
      (_type, descriptor) => {
        const uri = descriptor.fields.find((f) => f.type === "uri");
        expect(hintForConnectionErrorCode("bad_uri", descriptor)).toContain(
          uri!.placeholder,
        );
      },
    );

    it.each(["network", "container_loopback", "unknown"] as const)(
      "%s needs no example",
      (code) => {
        expect(hintForConnectionErrorCode(code, fixture)).toBe(
          hintForConnectionErrorCode(code),
        );
      },
    );

    it("falls back to the plain hint when the descriptor has no such field", () => {
      expect(
        hintForConnectionErrorCode("bad_uri", { ...fixture, fields: [] }),
      ).toBe(hintForConnectionErrorCode("bad_uri"));
    });
  });
});

// The most common thing a user does after `neoboard demo` is connect their own
// database. On a Docker install that database is on the HOST, so they type a
// localhost URI — and localhost inside the app container is the container. The
// connector reports an unreachable host, whose hint told them to verify the
// host, the port, that the database is running, and their firewall. All four
// are already correct. There was no thread to pull (#1346).
//
// This is about the DEPLOYMENT, not the connector, so it stays in the app.
describe("loopback from inside a container (#1346)", () => {
  const unreachable = raised(ConnectorErrorType.NETWORK);

  it.each([
    ["localhost", "fixturedb://localhost:7688"],
    ["127.0.0.1", "fixturedb://127.0.0.1:5432/app"],
    ["::1", "fixturedb://[::1]:7687"],
    ["with credentials in the URI", "fixturedb://u:p@localhost:5432/app"],
    ["uppercase host", "fixturedb://LOCALHOST:7687"],
  ])("codes a network failure to %s as container_loopback", (_l, uri) => {
    expect(connectionErrorCode(unreachable, { uri, containerised: true })).toBe(
      "container_loopback",
    );
  });

  it("stays `network` when the app is NOT containerised", () => {
    // The regression that matters. In local mode the app runs on the host,
    // where localhost is exactly right — telling that user to use a Docker
    // hostname would send them somewhere that does not exist.
    expect(
      connectionErrorCode(unreachable, {
        uri: "fixturedb://localhost:7688",
        containerised: false,
      }),
    ).toBe("network");
  });

  it.each([
    ["a remote host", "fixturedb://db.example.com:7687"],
    ["a compose service name", "fixturedb://graph:7687"],
    ["a LAN address", "fixturedb://192.168.1.50:5432/app"],
  ])("stays `network` for %s", (_l, uri) => {
    expect(connectionErrorCode(unreachable, { uri, containerised: true })).toBe(
      "network",
    );
  });

  it("does not outrank auth or bad_uri", () => {
    // A loopback auth failure is still an auth failure, and the Docker hint
    // would be a misdiagnosis.
    const context = { uri: "fixturedb://localhost:7688", containerised: true };
    expect(
      connectionErrorCode(raised(ConnectorErrorType.AUTHENTICATION), context),
    ).toBe("auth_failed");
    expect(
      connectionErrorCode(raised(ConnectorErrorType.BAD_URI), context),
    ).toBe("bad_uri");
  });

  it.each([
    ["a malformed URI", "not a uri at all"],
    ["an empty URI", ""],
  ])("degrades to `network` for %s rather than throwing", (_l, uri) => {
    // This runs on an error path. A classifier that throws replaces a bad
    // message with a 500.
    expect(connectionErrorCode(unreachable, { uri, containerised: true })).toBe(
      "network",
    );
  });

  it("is unchanged when no context is passed at all", () => {
    expect(connectionErrorCode(unreachable)).toBe("network");
  });

  it("names Docker, the CLI flag, and host.docker.internal in the hint", () => {
    const hint = hintForConnectionErrorCode("container_loopback");
    expect(hint).toMatch(/host\.docker\.internal/);
    expect(hint).toMatch(/container/i);
    // The hostname only resolves on Linux when the overlay is applied, so the
    // hint has to say how to apply it.
    expect(hint).toMatch(/--expose-host/);
  });

  it("says WHOSE localhost, because the URI is resolved server-side", () => {
    // The connection is opened by the NeoBoard server, not the browser. On a
    // deployed instance, a user typing `localhost` means the SERVER's
    // localhost — and host.docker.internal is the server's host too, not
    // theirs. A hint saying "not your machine" reads as though their own
    // laptop were reachable. It is not, and the copy has to say so.
    const hint = hintForConnectionErrorCode("container_loopback");
    expect(hint).toMatch(/server/i);
    expect(hint).toMatch(/your own computer/i);
    expect(hint).toMatch(/not reachable|cannot see your machine/i);
  });
});
