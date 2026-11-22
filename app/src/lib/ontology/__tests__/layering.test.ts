import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// #2534: lib/ sits below hooks/, and a property's parent key is built in one
// place (term-keys.ts), not by hand where it is read.
const DIR = path.resolve(__dirname, "..");
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ f, text: readFileSync(path.join(DIR, f), "utf8") }));

describe("lib/ontology", () => {
  it("imports nothing from hooks/", () => {
    expect(
      sources.filter((s) => /from "@\/hooks\//.test(s.text)).map((s) => s.f),
    ).toEqual([]);
  });

  it("builds the entity parent key only in term-keys.ts", () => {
    expect(
      sources
        .filter((s) => s.f !== "term-keys.ts" && s.text.includes("`entity:"))
        .map((s) => s.f),
    ).toEqual([]);
  });
});
