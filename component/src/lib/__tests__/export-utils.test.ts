import { describe, it, expect } from "vitest";
import { buildCsvString, triggerDownload } from "../export-utils";

describe("buildCsvString", () => {
  it("returns empty string for empty data", () => {
    expect(buildCsvString([])).toBe("");
  });

  it("builds CSV with headers from first row keys", () => {
    const data = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ];
    const csv = buildCsvString(data);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("name,age");
    expect(lines[1]).toBe("Alice,30");
    expect(lines[2]).toBe("Bob,25");
  });

  it("escapes values containing commas", () => {
    const data = [{ city: "New York, NY", pop: 8000000 }];
    const csv = buildCsvString(data);
    expect(csv).toContain('"New York, NY"');
  });

  it("escapes values containing double quotes", () => {
    const data = [{ note: 'He said "hello"' }];
    const csv = buildCsvString(data);
    expect(csv).toContain('"He said ""hello"""');
  });

  it("escapes values containing newlines", () => {
    const data = [{ text: "line1\nline2" }];
    const csv = buildCsvString(data);
    expect(csv).toContain('"line1\nline2"');
  });

  it("handles null and undefined values", () => {
    const data = [{ a: null, b: undefined, c: 1 }];
    const csv = buildCsvString(data);
    expect(csv).toBe("a,b,c\n,,1");
  });

  it("handles nested objects by JSON-stringifying them", () => {
    const data = [{ id: 1, props: { x: 10 } }];
    const csv = buildCsvString(data);
    expect(csv).toContain('"{""x"":10}"');
  });
});

describe("triggerDownload", () => {
  it("is a function", () => {
    expect(typeof triggerDownload).toBe("function");
  });
});
