import { describe, it, expect } from "vitest";
import {
  validatePluginExport,
  detectPluginType,
} from "../../lib/plugin-validator.js";

describe("validatePluginExport", () => {
  it("accepts a valid chart plugin", () => {
    const plugin = {
      type: "heatmap",
      label: "Heatmap",
      component: () => null,
      transform: (d: unknown) => d,
      compatibleWith: ["neo4j", "postgresql"],
    };
    const result = validatePluginExport(plugin);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a valid connector plugin", () => {
    const plugin = {
      type: "mongodb",
      label: "MongoDB",
      category: "database",
      createModule: () => ({}),
    };
    const result = validatePluginExport(plugin);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects null", () => {
    const result = validatePluginExport(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("must be an object");
  });

  it("rejects missing type", () => {
    const result = validatePluginExport({ label: "X", transform: () => {} });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('"type" must be a non-empty string');
  });

  it("rejects missing label", () => {
    const result = validatePluginExport({ type: "x", transform: () => {} });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('"label" must be a non-empty string');
  });

  it("rejects empty type", () => {
    const result = validatePluginExport({
      type: "",
      label: "X",
      transform: () => {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('"type" must be a non-empty string');
  });

  it("rejects plugin with neither transform nor createModule", () => {
    const result = validatePluginExport({ type: "x", label: "X" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Not a valid NeoBoard plugin");
  });

  it("rejects chart plugin missing compatibleWith", () => {
    const result = validatePluginExport({
      type: "x",
      label: "X",
      transform: () => {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      '"compatibleWith" must be a non-empty array of connector types',
    );
  });

  it("rejects connector plugin missing category", () => {
    const result = validatePluginExport({
      type: "x",
      label: "X",
      createModule: () => ({}),
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      '"category" must be one of: database, graph, api, file',
    );
  });

  it("rejects connector with invalid category", () => {
    const result = validatePluginExport({
      type: "x",
      label: "X",
      category: "invalid",
      createModule: () => ({}),
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      '"category" must be one of: database, graph, api, file',
    );
  });
});

describe("detectPluginType", () => {
  it("detects chart plugin", () => {
    expect(
      detectPluginType({ type: "x", label: "X", transform: () => {} }),
    ).toBe("chart");
  });

  it("detects connector plugin", () => {
    expect(
      detectPluginType({
        type: "x",
        label: "X",
        createModule: () => ({}),
      }),
    ).toBe("connector");
  });

  it("returns null for ambiguous (both)", () => {
    expect(
      detectPluginType({
        type: "x",
        label: "X",
        transform: () => {},
        createModule: () => ({}),
      }),
    ).toBe(null);
  });

  it("returns null for neither", () => {
    expect(detectPluginType({ type: "x", label: "X" })).toBe(null);
  });
});
