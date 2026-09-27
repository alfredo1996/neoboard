import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  demoConnectionInsert,
  demoConnectionUpdate,
} from "../lib/demo-connection.mjs";

/**
 * #2048 — the demo seeded its connections with the column default, `private`,
 * so only admin@ could see them and creator@ had nothing to build a widget on.
 * Both write paths must share them with the workspace.
 */
describe("demo connection rows", () => {
  it("inserts a new demo connection shared with the workspace", () => {
    expect(
      demoConnectionInsert({
        id: "c1",
        userId: "u1",
        name: "Neo4j Movies",
        type: "neo4j",
        configEncrypted: "iv:tag:ct",
      }),
    ).toEqual({
      id: "c1",
      userId: "u1",
      name: "Neo4j Movies",
      type: "neo4j",
      configEncrypted: "iv:tag:ct",
      visibility: "shared",
    });
  });

  // `neoboard demo seed` on an existing demo takes the UPDATE path.
  it("re-seeding an existing demo connection shares it too", () => {
    expect(demoConnectionUpdate("iv:tag:ct")).toEqual({
      configEncrypted: "iv:tag:ct",
      visibility: "shared",
    });
  });

  it("seed-demo.mjs writes both paths through the helpers", () => {
    const seed = readFileSync(
      new URL("../seed-demo.mjs", import.meta.url),
      "utf8",
    );
    expect(seed).toMatch(
      /INSERT INTO "connection" \$\{sql\(\s*demoConnectionInsert\(/,
    );
    expect(seed).toMatch(/SET \$\{sql\(demoConnectionUpdate\(/);
  });
});
