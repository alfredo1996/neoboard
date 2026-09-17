import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SHOWCASES, buildConnectionMap } from "../demo/showcases.mjs";

/**
 * #1861 — `applyConnectionMapping` throws on a portable key the seed does not
 * map, so a showcase that adds a connection seed-demo.mjs does not know about
 * fails `neoboard demo` for every showcase after it.
 */
const read = (s) => JSON.parse(readFileSync(s.jsonPath, "utf8"));
const widgetsOf = (json) => json.layout.pages.flatMap((p) => p.widgets);

describe("showcase connections", () => {
  it("seed-demo.mjs imports showcases through buildConnectionMap", () => {
    const seed = readFileSync(
      new URL("../seed-demo.mjs", import.meta.url),
      "utf8",
    );
    expect(seed).toMatch(/connectionMap = buildConnectionMap\(/);
  });

  const map = buildConnectionMap({
    neo4j: "id-neo4j",
    postgresMovies: "id-pg-movies",
    ecommerceRead: "id-read",
    ecommerceWrite: "id-write",
  });

  it("maps every key to a seeded connection id", () => {
    expect(Object.values(map)).not.toContain(undefined);
  });

  for (const showcase of SHOWCASES) {
    it(`${showcase.key}: every connection key it uses is mapped`, () => {
      const json = read(showcase);
      const keys = new Set([
        ...Object.keys(json.connections),
        ...widgetsOf(json)
          .map((w) => w.connectionId)
          .filter(Boolean),
      ]);
      expect([...keys].filter((k) => !(k in map))).toEqual([]);
    });
  }

  it("Movie Highlights queries Neo4j and PostgreSQL through one actor parameter", () => {
    const json = read(SHOWCASES.find((s) => s.key === "movie-highlights"));
    const types = Object.values(json.connections).map((c) => c.type);
    expect(types).toContain("neo4j");
    expect(types).toContain("postgresql");
    const pgKeys = Object.entries(json.connections)
      .filter(([, c]) => c.type === "postgresql")
      .map(([k]) => k);
    const pgActorWidgets = widgetsOf(json).filter(
      (w) => pgKeys.includes(w.connectionId) && /\$param_actor\b/.test(w.query),
    );
    expect(pgActorWidgets.length).toBeGreaterThan(0);
  });
});
