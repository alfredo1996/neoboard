import { describe, it, expect } from "vitest";
import { resolveSeedHosts } from "../lib/seed-hosts.mjs";

describe("resolveSeedHosts", () => {
  // Docker full-stack mode: the app runs INSIDE the neoboard-app container, so
  // localhost points at the container itself, not the DB containers. The CLI's
  // buildSeedEnv signals the reachable hosts via PG_HOST / NEO4J_HOST (the
  // compose service hostnames). Seeded connection URIs must bake those in.
  it("uses the CLI-provided Docker service hostnames (docker mode)", () => {
    expect(
      resolveSeedHosts({
        PG_HOST: "neoboard-postgres",
        NEO4J_HOST: "neoboard-neo4j",
      }),
    ).toEqual({ pgHost: "neoboard-postgres", neo4jHost: "neoboard-neo4j" });
  });

  // Local mode: the app runs on the host and reaches the published DB ports at
  // localhost. buildSeedEnv leaves PG_HOST/NEO4J_HOST unset, so we fall back.
  it("falls back to localhost when the hosts are unset (local mode)", () => {
    expect(resolveSeedHosts({})).toEqual({
      pgHost: "localhost",
      neo4jHost: "localhost",
    });
  });

  // An empty string is not a usable host — treat it as unset.
  it("treats an empty-string host as unset", () => {
    expect(resolveSeedHosts({ PG_HOST: "", NEO4J_HOST: "" })).toEqual({
      pgHost: "localhost",
      neo4jHost: "localhost",
    });
  });

  // Hosts are independent: one set, one unset.
  it("resolves each host independently", () => {
    expect(resolveSeedHosts({ PG_HOST: "neoboard-postgres" })).toEqual({
      pgHost: "neoboard-postgres",
      neo4jHost: "localhost",
    });
  });
});
