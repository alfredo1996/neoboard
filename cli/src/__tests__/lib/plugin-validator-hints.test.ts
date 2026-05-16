import { describe, it, expect } from "vitest";
import {
  hintForValidatorError,
  hintForMissingExport,
  PLUGIN_DOCS_URL,
} from "../../lib/plugin-validator-hints.js";

describe("hintForValidatorError", () => {
  it("returns a docs-linked hint for missing/empty type", () => {
    const h = hintForValidatorError('"type" must be a non-empty string');
    expect(h).toBeTruthy();
    expect(h).toContain("type:");
    expect(h).toContain(PLUGIN_DOCS_URL);
  });

  it("returns a docs-linked hint for missing/empty label", () => {
    const h = hintForValidatorError('"label" must be a non-empty string');
    expect(h).toBeTruthy();
    expect(h).toContain("label:");
    expect(h).toContain(PLUGIN_DOCS_URL);
  });

  it("returns a hint for missing compatibleWith (chart plugins)", () => {
    const h = hintForValidatorError(
      '"compatibleWith" must be a non-empty array of connector types',
    );
    expect(h).toBeTruthy();
    expect(h).toContain("compatibleWith");
    expect(h).toMatch(/neo4j|postgresql/);
    expect(h).toContain(PLUGIN_DOCS_URL);
  });

  it("returns a hint for invalid connector category", () => {
    const h = hintForValidatorError(
      '"category" must be one of: database, graph, api, file',
    );
    expect(h).toBeTruthy();
    expect(h).toContain("category");
    expect(h).toContain(PLUGIN_DOCS_URL);
  });

  it("returns a hint when the plugin is not detected (no transform/createModule)", () => {
    const h = hintForValidatorError(
      "Not a valid NeoBoard plugin: must export either a transform function (chart) or a createModule function (connector).",
    );
    expect(h).toBeTruthy();
    expect(h).toMatch(/transform|createModule/);
    expect(h).toContain(PLUGIN_DOCS_URL);
  });

  it("returns a hint when the plugin export isn't an object", () => {
    const h = hintForValidatorError("Plugin export must be an object");
    expect(h).toBeTruthy();
    expect(h).toContain(PLUGIN_DOCS_URL);
  });

  it("returns null for an unrecognized error (no false-confidence hint)", () => {
    expect(
      hintForValidatorError("totally novel error message we don't recognize"),
    ).toBeNull();
  });

  it("matches by substring (works with extra prefix/suffix wording)", () => {
    const h = hintForValidatorError(
      'Validation: "type" must be a non-empty string (got undefined)',
    );
    expect(h).toBeTruthy();
  });
});

describe("hintForMissingExport", () => {
  it("when default export missing but module has named exports, suggests --export", () => {
    const h = hintForMissingExport("default", ["myPlugin", "config"]);
    expect(h).toBeTruthy();
    expect(h).toContain("--export");
    // Mentions at least one of the actually-available names
    expect(h === null || /myPlugin|config/.test(h)).toBe(true);
  });

  it("when a named --export is missing but other names exist, lists them", () => {
    const h = hintForMissingExport("wrongName", ["myPlugin", "default"]);
    expect(h).toBeTruthy();
    expect(h).toContain("myPlugin");
  });

  it("ignores 'default' when listing alternatives for a missing named export", () => {
    const h = hintForMissingExport("wrongName", ["default"]);
    // Only 'default' available — no named alternative to suggest
    expect(h).toBeNull();
  });

  it("returns null when the module has no other exports to suggest", () => {
    expect(hintForMissingExport("default", [])).toBeNull();
  });

  it("dedupes the requested name out of the suggestion list", () => {
    const h = hintForMissingExport("foo", ["foo", "bar"]);
    expect(h).toBeTruthy();
    // Should not echo 'foo' back (that's what the user typed)
    const matches = h?.match(/\bfoo\b/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1); // at most once if quoted as missing
  });
});
