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
