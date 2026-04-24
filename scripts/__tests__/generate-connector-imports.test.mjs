import { describe, it, expect } from "vitest";
import {
  validateEntry,
  validateManifest,
  renderSource,
} from "../generate-connector-imports.mjs";

describe("validateEntry", () => {
  it("accepts a valid entry with package only", () => {
    expect(validateEntry({ package: "@myorg/neoboard-mongodb" }, 0)).toBeNull();
  });

  it("accepts a valid entry with all fields", () => {
    expect(
      validateEntry(
        { package: "@myorg/neoboard-mongodb", export: "plugin", overrides: true },
        0,
      ),
    ).toBeNull();
  });

  it("rejects non-object", () => {
    expect(validateEntry("string", 0)).toContain("must be an object");
  });

  it("rejects missing package", () => {
    expect(validateEntry({}, 0)).toContain("package must be a non-empty string");
  });

  it("rejects empty package", () => {
    expect(validateEntry({ package: "" }, 0)).toContain("non-empty");
  });

  it("rejects package with spaces", () => {
    expect(validateEntry({ package: "my package" }, 0)).toContain(
      "whitespace",
    );
  });

  it("rejects invalid export identifier", () => {
    expect(
      validateEntry({ package: "pkg", export: "not-valid" }, 0),
    ).toContain("valid JavaScript identifier");
  });

  it("accepts 'default' export", () => {
    expect(
      validateEntry({ package: "pkg", export: "default" }, 0),
    ).toBeNull();
  });

  it("rejects unknown keys", () => {
    expect(
      validateEntry({ package: "pkg", extra: true }, 0),
    ).toContain('unknown key "extra"');
  });
});

describe("validateManifest", () => {
  it("accepts empty connectors array", () => {
    const { errors, entries } = validateManifest({ connectors: [] });
    expect(errors).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it("accepts valid entries", () => {
    const { errors, entries } = validateManifest({
      connectors: [{ package: "@myorg/mongodb" }],
    });
    expect(errors).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].package).toBe("@myorg/mongodb");
    expect(entries[0].export).toBe("default");
    expect(entries[0].overrides).toBe(false);
  });

  it("rejects non-object manifest", () => {
    const { errors } = validateManifest("bad");
    expect(errors[0]).toContain("must be a JSON object");
  });

  it("rejects missing connectors key", () => {
    const { errors } = validateManifest({});
    expect(errors[0]).toContain("must be an array");
  });

  it("detects duplicate entries", () => {
    const { errors } = validateManifest({
      connectors: [
        { package: "@myorg/mongodb" },
        { package: "@myorg/mongodb" },
      ],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("duplicate");
  });
});

describe("renderSource", () => {
  it("renders empty array for no entries", () => {
    const source = renderSource([]);
    expect(source).toContain("EXTERNAL_CONNECTORS: ExternalConnectorEntry[] = []");
  });

  it("renders import for default export", () => {
    const source = renderSource([
      { package: "@myorg/mongodb", export: "default", overrides: false },
    ]);
    expect(source).toContain('import externalConnector0 from "@myorg/mongodb"');
    expect(source).toContain("plugin: externalConnector0");
    expect(source).toContain("overrides: false");
  });

  it("renders import for named export", () => {
    const source = renderSource([
      { package: "@myorg/mongodb", export: "plugin", overrides: true },
    ]);
    expect(source).toContain(
      '{ plugin as externalConnector0 } from "@myorg/mongodb"',
    );
    expect(source).toContain("overrides: true");
  });

  it("renders ConnectorPlugin type reference", () => {
    const source = renderSource([]);
    expect(source).toContain("ConnectorPlugin");
  });
});
