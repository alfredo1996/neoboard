import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseOnlyFlag, SHOWCASES, SHOWCASE_KEYS } from "../showcases.mjs";

describe("showcases.mjs — manifest", () => {
  it("exports a non-empty SHOWCASES array", () => {
    assert.ok(Array.isArray(SHOWCASES));
    assert.ok(SHOWCASES.length >= 4);
  });

  it("every showcase has key, label, description, jsonPath", () => {
    for (const s of SHOWCASES) {
      assert.ok(typeof s.key === "string" && s.key.length > 0);
      assert.ok(typeof s.label === "string" && s.label.length > 0);
      assert.ok(typeof s.description === "string");
      assert.ok(typeof s.jsonPath === "string");
    }
  });

  it("SHOWCASE_KEYS matches SHOWCASES keys", () => {
    const keys = new Set(SHOWCASES.map((s) => s.key));
    assert.deepEqual(SHOWCASE_KEYS, keys);
  });
});

describe("parseOnlyFlag", () => {
  it("returns undefined for undefined input", () => {
    assert.equal(parseOnlyFlag(undefined), undefined);
  });

  it("returns undefined for empty string", () => {
    assert.equal(parseOnlyFlag(""), undefined);
  });

  it("parses a single valid key", () => {
    assert.deepEqual(parseOnlyFlag("chart-gallery"), ["chart-gallery"]);
  });

  it("parses multiple comma-separated keys", () => {
    const result = parseOnlyFlag("chart-gallery,click-actions");
    assert.deepEqual(result, ["chart-gallery", "click-actions"]);
  });

  it("trims whitespace around keys", () => {
    const result = parseOnlyFlag("  chart-gallery , click-actions  ");
    assert.deepEqual(result, ["chart-gallery", "click-actions"]);
  });

  it("filters out empty segments from trailing commas", () => {
    const result = parseOnlyFlag("chart-gallery,");
    assert.deepEqual(result, ["chart-gallery"]);
  });

  it("throws on unknown keys with a message listing valid ones", () => {
    assert.throws(
      () => parseOnlyFlag("bogus"),
      (err) => {
        assert.ok(err.message.includes("Unknown showcase key(s): bogus"));
        assert.ok(err.message.includes("Valid keys:"));
        return true;
      },
    );
  });

  it("throws listing all invalid keys when multiple are bad", () => {
    assert.throws(
      () => parseOnlyFlag("a,b"),
      /Unknown showcase key\(s\): a, b/,
    );
  });

  it("throws when mixing valid and invalid keys", () => {
    assert.throws(
      () => parseOnlyFlag("chart-gallery,nope"),
      /Unknown showcase key\(s\): nope/,
    );
  });
});
