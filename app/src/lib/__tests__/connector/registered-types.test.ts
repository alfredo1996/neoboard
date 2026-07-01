import { describe, it, expect, vi } from "vitest";

// Mock the connection-adapter seam so this stays a pure unit test (no drivers).
vi.mock("@/lib/connector/connection-adapter", () => ({
  getConnector: (type: string) =>
    type === "neo4j" || type === "postgresql" ? { type } : undefined,
  getAllConnectors: () => [{ type: "neo4j" }, { type: "postgresql" }],
}));

import {
  isRegisteredConnectorType,
  registeredConnectorTypes,
} from "@/lib/connector/registered-types";

describe("isRegisteredConnectorType", () => {
  it("returns true for a registered connector type", () => {
    expect(isRegisteredConnectorType("neo4j")).toBe(true);
    expect(isRegisteredConnectorType("postgresql")).toBe(true);
  });

  it("returns false for an unregistered type", () => {
    expect(isRegisteredConnectorType("mysql")).toBe(false);
  });
});

describe("registeredConnectorTypes", () => {
  it("lists all registered connector type identifiers", () => {
    expect(registeredConnectorTypes()).toEqual(["neo4j", "postgresql"]);
  });
});
