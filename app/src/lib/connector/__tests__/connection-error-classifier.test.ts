import { describe, it, expect } from "vitest";
import {
  classifyConnectionError,
  hintForConnectionErrorCode,
  type ConnectionErrorCode,
} from "../connection-error-classifier";

describe("classifyConnectionError", () => {
  describe("auth_failed", () => {
    it.each([
      "authentication failure",
      "AuthenticationRateLimit",
      "The client is unauthorized due to authentication failure.",
      'password authentication failed for user "neo4j"',
      "Unauthorized: invalid credentials",
    ])("classifies %j as auth_failed", (msg) => {
      expect(classifyConnectionError(msg)).toBe("auth_failed");
    });
  });

  describe("network", () => {
    it.each([
      "connect ECONNREFUSED 127.0.0.1:7687",
      "getaddrinfo ENOTFOUND db.example.com",
      "connect ETIMEDOUT",
      "ServiceUnavailable: Could not perform discovery. No routing servers available.",
      "WebSocket connection failure",
      "Network is unreachable",
    ])("classifies %j as network", (msg) => {
      expect(classifyConnectionError(msg)).toBe("network");
    });
  });

  describe("bad_uri", () => {
    it.each([
      "Invalid URI scheme: 'http'",
      "Could not parse URI",
      "Unknown scheme: postgres+s",
      "Invalid connection URI: missing host",
      "URI malformed",
    ])("classifies %j as bad_uri", (msg) => {
      expect(classifyConnectionError(msg)).toBe("bad_uri");
    });
  });

  describe("unknown", () => {
    it("classifies an unrecognised error as unknown", () => {
      expect(
        classifyConnectionError("Something completely unrecognized happened"),
      ).toBe("unknown");
    });

    it("classifies empty string as unknown", () => {
      expect(classifyConnectionError("")).toBe("unknown");
    });
  });

  describe("priority", () => {
    it("auth wins over network when both keywords appear", () => {
      // Network keywords showing up in auth-related stacks should still bucket as auth_failed
      // (auth failures are higher-priority for the user — they fix credentials first)
      expect(
        classifyConnectionError(
          "authentication failure: ECONNREFUSED while reading server greeting",
        ),
      ).toBe("auth_failed");
    });

    it("bad_uri wins over network when URI is malformed (network is downstream)", () => {
      expect(
        classifyConnectionError(
          "Invalid URI scheme: 'http' (ETIMEDOUT trying to connect)",
        ),
      ).toBe("bad_uri");
    });
  });
});

describe("hintForConnectionErrorCode", () => {
  const ALL: ConnectionErrorCode[] = [
    "auth_failed",
    "network",
    "bad_uri",
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

  it("hint copy never leaks driver internals (heuristic)", () => {
    for (const code of ALL) {
      const hint = hintForConnectionErrorCode(code);
      // Hints are written as user-facing English, no stack words leaking.
      expect(hint.toLowerCase()).not.toContain("econnrefused");
      expect(hint.toLowerCase()).not.toContain("enotfound");
    }
  });
});

// The most common thing a user does after `neoboard demo` is connect their own
// database. On a Docker install that database is on the HOST, so they type
// neo4j://localhost:7688 — and localhost inside the app container is the
// container. The driver says "Could not perform discovery. No routing servers
// available", which classified as `network`, whose hint told them to verify the
// host, the port, that the database is running, and their firewall. All four
// are already correct. There was no thread to pull (#1346).
describe("loopback from inside a container (#1346)", () => {
  const DISCOVERY_ERROR =
    "Could not perform discovery. No routing servers available.";

  it.each([
    ["localhost", "neo4j://localhost:7688"],
    ["127.0.0.1", "postgresql://127.0.0.1:5432/app"],
    ["::1", "neo4j://[::1]:7687"],
    ["with credentials in the URI", "postgresql://u:p@localhost:5432/app"],
    ["uppercase host", "neo4j://LOCALHOST:7687"],
  ])("codes a network failure to %s as container_loopback", (_l, uri) => {
    expect(
      classifyConnectionError(DISCOVERY_ERROR, { uri, containerised: true }),
    ).toBe("container_loopback");
  });

  it("stays `network` when the app is NOT containerised", () => {
    // The regression that matters. In local mode the app runs on the host,
    // where localhost is exactly right — telling that user to use a Docker
    // hostname would send them somewhere that does not exist.
    expect(
      classifyConnectionError(DISCOVERY_ERROR, {
        uri: "neo4j://localhost:7688",
        containerised: false,
      }),
    ).toBe("network");
  });

  it.each([
    ["a remote host", "neo4j://db.example.com:7687"],
    ["a compose service name", "neo4j://neo4j:7687"],
    ["a LAN address", "postgresql://192.168.1.50:5432/app"],
  ])("stays `network` for %s", (_l, uri) => {
    expect(
      classifyConnectionError(DISCOVERY_ERROR, { uri, containerised: true }),
    ).toBe("network");
  });

  it("does not outrank auth or bad_uri", () => {
    // Priority order is unchanged: a loopback auth failure is still an auth
    // failure, and the Docker hint would be a misdiagnosis.
    expect(
      classifyConnectionError("Authentication failure", {
        uri: "neo4j://localhost:7688",
        containerised: true,
      }),
    ).toBe("auth_failed");
    expect(
      classifyConnectionError("Invalid URI scheme", {
        uri: "wat://localhost:7688",
        containerised: true,
      }),
    ).toBe("bad_uri");
  });

  it.each([
    ["a malformed URI", "not a uri at all"],
    ["an empty URI", ""],
  ])("degrades to `network` for %s rather than throwing", (_l, uri) => {
    // This runs on an error path. A classifier that throws replaces a bad
    // message with a 500.
    expect(() =>
      classifyConnectionError(DISCOVERY_ERROR, { uri, containerised: true }),
    ).not.toThrow();
    expect(
      classifyConnectionError(DISCOVERY_ERROR, { uri, containerised: true }),
    ).toBe("network");
  });

  it("is unchanged when no context is passed at all", () => {
    expect(classifyConnectionError(DISCOVERY_ERROR)).toBe("network");
  });

  it("names Docker and host.docker.internal in the hint", () => {
    const hint = hintForConnectionErrorCode("container_loopback");
    expect(hint).toMatch(/host\.docker\.internal/);
    expect(hint).toMatch(/container/i);
  });
});
