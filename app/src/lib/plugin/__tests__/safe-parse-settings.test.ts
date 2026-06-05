import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { safeParseSettings } from "../safe-parse-settings";

// Spy on console.warn — helper is browser-safe (no pino) so logging goes
// to console with a structured payload.
const mockWarn = vi.fn();
const originalWarn = console.warn;

describe("safeParseSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.warn = mockWarn;
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  it("returns the parsed data when validation succeeds", () => {
    const schema = z.object({
      title: z.string().default("Untitled"),
      enabled: z.boolean().default(false),
    });
    const result = safeParseSettings(
      schema,
      { title: "Real", enabled: true },
      "test-plugin",
    );
    expect(result).toEqual({ title: "Real", enabled: true });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("returns schema defaults when validation fails", () => {
    const schema = z.object({
      layout: z.enum(["force", "circular"]).default("force"),
    });
    const result = safeParseSettings(
      schema,
      { layout: "hierarchical" },
      "graph",
    );
    expect(result.layout).toBe("force");
  });

  it("logs a structured warning on validation failure", () => {
    const schema = z.object({
      layout: z.enum(["force", "circular"]).default("force"),
    });
    safeParseSettings(schema, { layout: "weirdLayout" }, "graph");
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const [message, payload] = mockWarn.mock.calls[0];
    expect(message).toMatch(/reverted to defaults/i);
    expect(payload.pluginId).toBe("graph");
    expect(payload.issues).toBeInstanceOf(Array);
    expect(payload.issues[0].path).toEqual(["layout"]);
  });

  it("does not log when validation succeeds", () => {
    const schema = z.object({ x: z.number().default(0) });
    safeParseSettings(schema, { x: 5 }, "test");
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("handles undefined / null raw values via empty-object defaults", () => {
    const schema = z.object({
      label: z.string().default("hello"),
    });
    expect(safeParseSettings(schema, undefined, "test").label).toBe("hello");
    expect(safeParseSettings(schema, null, "test").label).toBe("hello");
  });

  it("preserves passthrough fields when schema uses .passthrough()", () => {
    const schema = z.object({ known: z.string().optional() }).passthrough();
    const result = safeParseSettings(
      schema,
      { known: "yes", extra: 42 },
      "test",
    );
    expect(result).toEqual({ known: "yes", extra: 42 });
  });

  it("propagates errors when even the defaults path throws (broken schema)", () => {
    // Schema with NO defaults; parsing {} fails with "required" — surfaces the
    // schema-itself-is-broken case to the error boundary.
    const schema = z.object({ required: z.string() });
    expect(() =>
      safeParseSettings(schema, { badValue: 123 }, "broken-plugin"),
    ).toThrow();
  });

  it("applies field-level defaults when raw is missing fields", () => {
    const schema = z.object({
      a: z.string().default("A"),
      b: z.number().default(7),
    });
    const result = safeParseSettings(schema, {}, "test");
    expect(result).toEqual({ a: "A", b: 7 });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("includes pluginId in the log payload for traceability", () => {
    const schema = z.object({ layout: z.enum(["a", "b"]).default("a") });
    safeParseSettings(schema, { layout: "c" }, "my-special-plugin");
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][1].pluginId).toBe("my-special-plugin");
  });
});
