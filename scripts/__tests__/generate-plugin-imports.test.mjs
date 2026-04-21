import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateEntry,
  validateManifest,
  renderSource,
  runGenerator,
} from "../generate-plugin-imports.mjs";

// ---------------------------------------------------------------------------
// validateEntry
// ---------------------------------------------------------------------------

describe("validateEntry", () => {
  it("returns null for a minimal valid entry", () => {
    assert.equal(validateEntry({ package: "foo" }, 0), null);
  });

  it("returns null for a full valid entry", () => {
    assert.equal(
      validateEntry(
        { package: "foo", export: "myExport", overrides: true },
        0,
      ),
      null,
    );
  });

  it("rejects non-object entry", () => {
    assert.match(validateEntry("not-an-object", 0), /must be an object/);
    assert.match(validateEntry(null, 2), /must be an object/);
  });

  it("rejects missing package", () => {
    assert.match(validateEntry({}, 0), /package must be a non-empty string/);
  });

  it("rejects empty package string", () => {
    assert.match(
      validateEntry({ package: "   " }, 0),
      /package must be a non-empty string/,
    );
  });

  it("rejects non-string export", () => {
    assert.match(
      validateEntry({ package: "foo", export: 42 }, 0),
      /export must be a non-empty string/,
    );
  });

  it("rejects non-boolean overrides", () => {
    assert.match(
      validateEntry({ package: "foo", overrides: "yes" }, 0),
      /overrides must be a boolean/,
    );
  });

  it("rejects unknown keys", () => {
    assert.match(
      validateEntry({ package: "foo", extraKey: true }, 0),
      /unknown key "extraKey"/,
    );
  });

  it("includes the index in error messages", () => {
    assert.match(validateEntry({}, 5), /plugins\[5\]/);
  });
});

// ---------------------------------------------------------------------------
// validateManifest
// ---------------------------------------------------------------------------

describe("validateManifest", () => {
  it("accepts a valid empty manifest", () => {
    const { errors, entries } = validateManifest({ plugins: [] });
    assert.deepEqual(errors, []);
    assert.deepEqual(entries, []);
  });

  it("accepts a manifest with multiple entries", () => {
    const { errors, entries } = validateManifest({
      plugins: [
        { package: "@a/one" },
        { package: "@a/two", export: "named", overrides: true },
      ],
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(entries, [
      { package: "@a/one", export: "default", overrides: false },
      { package: "@a/two", export: "named", overrides: true },
    ]);
  });

  it("rejects non-object manifest", () => {
    const { errors } = validateManifest("nope");
    assert.match(errors[0], /must be a JSON object/);
  });

  it("rejects missing plugins array", () => {
    const { errors } = validateManifest({});
    assert.match(errors[0], /plugins must be an array/);
  });

  it("detects duplicate package+export pairs", () => {
    const { errors } = validateManifest({
      plugins: [{ package: "@a/dup" }, { package: "@a/dup" }],
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /duplicate entry/);
  });

  it("allows same package with different exports", () => {
    const { errors, entries } = validateManifest({
      plugins: [
        { package: "@a/multi" },
        { package: "@a/multi", export: "heatmap" },
      ],
    });
    assert.deepEqual(errors, []);
    assert.equal(entries.length, 2);
  });

  it("accumulates errors from multiple bad entries", () => {
    const { errors } = validateManifest({
      plugins: [{ package: "" }, { package: "ok" }, { package: 42 }],
    });
    assert.equal(errors.length, 2);
  });
});

// ---------------------------------------------------------------------------
// renderSource
// ---------------------------------------------------------------------------

describe("renderSource", () => {
  it("emits an empty array when no entries", () => {
    const src = renderSource([]);
    assert.match(src, /EXTERNAL_PLUGINS: ExternalPluginEntry\[\] = \[\]/);
  });

  it("emits default imports with numbered aliases", () => {
    const src = renderSource([
      { package: "@a/one", export: "default", overrides: false },
      { package: "@a/two", export: "default", overrides: true },
    ]);
    assert.match(src, /import externalPlugin0 from "@a\/one";/);
    assert.match(src, /import externalPlugin1 from "@a\/two";/);
    assert.match(src, /plugin: externalPlugin0, overrides: false/);
    assert.match(src, /plugin: externalPlugin1, overrides: true/);
  });

  it("emits named imports with 'as alias' syntax", () => {
    const src = renderSource([
      { package: "@a/one", export: "heatmap", overrides: false },
    ]);
    assert.match(src, /import \{ heatmap as externalPlugin0 \} from "@a\/one";/);
  });

  it("includes AUTO-GENERATED header", () => {
    const src = renderSource([]);
    assert.match(src, /AUTO-GENERATED/);
    assert.match(src, /neoboard-plugins.json/);
  });
});

// ---------------------------------------------------------------------------
// runGenerator (end-to-end with temp files)
// ---------------------------------------------------------------------------

describe("runGenerator", () => {
  function withTempDir(fn) {
    const dir = mkdtempSync(join(tmpdir(), "neoboard-plugins-"));
    const manifest = join(dir, "neoboard-plugins.json");
    const output = join(dir, "out.ts");
    return fn({ dir, manifest, output });
  }

  it("writes the output when manifest is valid and empty", () => {
    withTempDir(({ manifest, output }) => {
      writeFileSync(manifest, JSON.stringify({ plugins: [] }));
      const result = runGenerator({
        manifestPath: manifest,
        outputPath: output,
      });
      assert.equal(result.ok, true);
      assert.equal(result.wrote, true);
      assert.ok(existsSync(output));
    });
  });

  it("is idempotent — second run with unchanged manifest does not rewrite", () => {
    withTempDir(({ manifest, output }) => {
      writeFileSync(manifest, JSON.stringify({ plugins: [] }));
      runGenerator({ manifestPath: manifest, outputPath: output });
      const first = readFileSync(output, "utf8");
      const second = runGenerator({
        manifestPath: manifest,
        outputPath: output,
      });
      assert.equal(second.wrote, false);
      assert.equal(readFileSync(output, "utf8"), first);
    });
  });

  it("fails with a clear error when manifest is missing", () => {
    withTempDir(({ dir }) => {
      const result = runGenerator({
        manifestPath: join(dir, "missing.json"),
        outputPath: join(dir, "out.ts"),
      });
      assert.equal(result.ok, false);
      assert.match(result.errors[0], /Manifest not found/);
    });
  });

  it("fails with a clear error when manifest has invalid JSON", () => {
    withTempDir(({ manifest, output }) => {
      writeFileSync(manifest, "{ bad json");
      const result = runGenerator({
        manifestPath: manifest,
        outputPath: output,
      });
      assert.equal(result.ok, false);
      assert.match(result.errors[0], /not valid JSON/);
    });
  });

  it("fails with validation errors when manifest has bad entries", () => {
    withTempDir(({ manifest, output }) => {
      writeFileSync(
        manifest,
        JSON.stringify({ plugins: [{ package: "" }] }),
      );
      const result = runGenerator({
        manifestPath: manifest,
        outputPath: output,
      });
      assert.equal(result.ok, false);
      assert.match(result.errors[0], /package must be a non-empty string/);
    });
  });
});
