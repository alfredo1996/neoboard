import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIsContainerised = vi.fn();
vi.mock("@/lib/connector/is-containerised", () => ({
  isContainerised: () => mockIsContainerised(),
}));

const mockAliasResolves = vi.fn();
vi.mock("@/lib/connector/host-alias", () => ({
  hostAliasResolves: () => mockAliasResolves(),
}));

import { resolveContainerHost } from "@/lib/connector/container-host";

beforeEach(() => {
  vi.clearAllMocks();
  mockAliasResolves.mockResolvedValue(true);
});

describe("resolveContainerHost (#1346)", () => {
  describe("inside a container", () => {
    beforeEach(() => mockIsContainerised.mockReturnValue(true));

    it.each([
      ["neo4j://localhost:7688", "neo4j://host.docker.internal:7688"],
      ["bolt://127.0.0.1:7687", "bolt://host.docker.internal:7687"],
      ["neo4j://LOCALHOST:7687", "neo4j://host.docker.internal:7687"],
    ])("rewrites %s", async (input, expected) => {
      await expect(resolveContainerHost(input)).resolves.toBe(expected);
    });

    it("keeps credentials, port, path and query intact", async () => {
      // A rewrite that drops the password or the database name trades one
      // failure for a more confusing one.
      await expect(
        resolveContainerHost(
          "postgresql://u:p%40ss@localhost:5432/app?sslmode=require",
        ),
      ).resolves.toBe(
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
    ])("leaves %s alone", async (_l, uri) => {
      await expect(resolveContainerHost(uri)).resolves.toBe(uri);
    });

    it.each([
      ["an unparseable uri", "not a uri"],
      ["an empty string", ""],
    ])("returns %s unchanged rather than throwing", async (_l, uri) => {
      await expect(resolveContainerHost(uri)).resolves.toBe(uri);
    });

    it("leaves loopback ALONE when the alias does not resolve (#1348)", async () => {
      // Linux without --expose-host. Rewriting here would turn ECONNREFUSED
      // into ENOTFOUND for a hostname the user never typed — worse than the
      // error it replaces — and suppress the container_loopback hint that
      // names the flag.
      mockAliasResolves.mockResolvedValue(false);
      await expect(
        resolveContainerHost("neo4j://localhost:7688"),
      ).resolves.toBe("neo4j://localhost:7688");
    });

    it("does not probe DNS for a non-loopback host", async () => {
      // The lookup is cached, but the overwhelming majority of URIs are not
      // loopback and have no business touching it.
      await resolveContainerHost("neo4j://db.example.com:7687");
      expect(mockAliasResolves).not.toHaveBeenCalled();
    });
  });

  it("leaves loopback alone when NOT containerised", async () => {
    // Local mode runs on the host, where localhost is exactly right. Rewriting
    // it there would break a working setup.
    mockIsContainerised.mockReturnValue(false);
    await expect(resolveContainerHost("neo4j://localhost:7688")).resolves.toBe(
      "neo4j://localhost:7688",
    );
  });
});
