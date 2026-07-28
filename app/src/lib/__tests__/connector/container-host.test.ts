import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIsContainerised = vi.fn();
vi.mock("@/lib/connector/is-containerised", () => ({
  isContainerised: () => mockIsContainerised(),
}));

import { resolveContainerHost } from "@/lib/connector/container-host";

beforeEach(() => vi.clearAllMocks());

describe("resolveContainerHost (#1346)", () => {
  describe("inside a container", () => {
    beforeEach(() => mockIsContainerised.mockReturnValue(true));

    it.each([
      ["neo4j://localhost:7688", "neo4j://host.docker.internal:7688"],
      ["bolt://127.0.0.1:7687", "bolt://host.docker.internal:7687"],
      ["neo4j://LOCALHOST:7687", "neo4j://host.docker.internal:7687"],
    ])("rewrites %s", (input, expected) => {
      expect(resolveContainerHost(input)).toBe(expected);
    });

    it("keeps credentials, port, path and query intact", () => {
      // A rewrite that drops the password or the database name trades one
      // failure for a more confusing one.
      expect(
        resolveContainerHost(
          "postgresql://u:p%40ss@localhost:5432/app?sslmode=require",
        ),
      ).toBe(
        "postgresql://u:p%40ss@host.docker.internal:5432/app?sslmode=require",
      );
    });

    it.each([
      ["a remote host", "neo4j://db.example.com:7687"],
      ["a compose service name", "neo4j://neo4j:7687"],
      ["a LAN address", "postgresql://192.168.1.50:5432/app"],
      [
        "a host merely containing 'localhost'",
        "neo4j://my-localhost.example.com:7687",
      ],
    ])("leaves %s alone", (_l, uri) => {
      expect(resolveContainerHost(uri)).toBe(uri);
    });

    it.each([
      ["an unparseable uri", "not a uri"],
      ["an empty string", ""],
    ])("returns %s unchanged rather than throwing", (_l, uri) => {
      expect(() => resolveContainerHost(uri)).not.toThrow();
      expect(resolveContainerHost(uri)).toBe(uri);
    });
  });

  it("leaves loopback alone when NOT containerised", () => {
    // Local mode runs on the host, where localhost is exactly right. Rewriting
    // it there would break a working setup.
    mockIsContainerised.mockReturnValue(false);
    expect(resolveContainerHost("neo4j://localhost:7688")).toBe(
      "neo4j://localhost:7688",
    );
  });
});
