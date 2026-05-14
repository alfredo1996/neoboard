import { describe, it, expect } from "vitest";
import {
  buildCsvString,
  triggerDownload,
  triggerSvgDownload,
  buildExportFilename,
  escapeCsvCell,
} from "../export-utils";

describe("escapeCsvCell", () => {
  it("returns empty string for null", () => {
    expect(escapeCsvCell(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("returns plain string when no special chars", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
  });

  it("returns number as string", () => {
    expect(escapeCsvCell(42)).toBe("42");
  });

  it("returns boolean as string", () => {
    expect(escapeCsvCell(true)).toBe("true");
  });

  it("wraps in quotes when value contains a comma", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
  });

  it("wraps in quotes and doubles inner quotes", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps in quotes when value contains \\n", () => {
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps in quotes when value contains \\r", () => {
    expect(escapeCsvCell("line1\rline2")).toBe('"line1\rline2"');
  });

  it("wraps in quotes when value contains \\r\\n", () => {
    expect(escapeCsvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("JSON-stringifies objects", () => {
    expect(escapeCsvCell({ x: 1 })).toBe('"{""x"":1}"');
  });

  it("JSON-stringifies arrays", () => {
    expect(escapeCsvCell([1, 2])).toBe('"[1,2]"');
  });

  it("handles empty string without wrapping", () => {
    expect(escapeCsvCell("")).toBe("");
  });
});

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
    const lines = csv.split("\r\n");
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

  it("escapes values containing carriage returns", () => {
    const data = [{ text: "line1\rline2" }];
    const csv = buildCsvString(data);
    expect(csv).toContain('"line1\rline2"');
  });

  it("handles null and undefined values", () => {
    const data = [{ a: null, b: undefined, c: 1 }];
    const csv = buildCsvString(data);
    expect(csv).toBe("a,b,c\r\n,,1");
  });

  it("handles nested objects by JSON-stringifying them", () => {
    const data = [{ id: 1, props: { x: 10 } }];
    const csv = buildCsvString(data);
    expect(csv).toContain('"{""x"":10}"');
  });

  it("escapes headers that contain commas", () => {
    const data = [{ "col,a": 1 }];
    const csv = buildCsvString(data);
    expect(csv).toBe('"col,a"\r\n1');
  });

  it("escapes headers that contain double quotes", () => {
    const data = [{ 'col"b': 2 }];
    const csv = buildCsvString(data);
    expect(csv).toBe('"col""b"\r\n2');
  });

  it("escapes headers that contain newlines", () => {
    const data = [{ "col\nc": 3 }];
    const csv = buildCsvString(data);
    // The full CSV includes the escaped header and the data row
    expect(csv).toContain('"col\nc"');
  });

  it("escapes headers that contain carriage returns", () => {
    const data = [{ "col\ra": 1 }];
    const csv = buildCsvString(data);
    const headerLine = csv.split("\r\n")[0];
    expect(headerLine).toBe('"col\ra"');
  });

  it("handles single row with single column", () => {
    const data = [{ value: 42 }];
    const csv = buildCsvString(data);
    expect(csv).toBe("value\r\n42");
  });

  it("uses first row keys for all rows even if later rows have different keys", () => {
    const data: Record<string, unknown>[] = [
      { a: 1, b: 2 },
      { a: 3, c: 4 },
    ];
    const csv = buildCsvString(data);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("a,b");
    // second row: a=3, b=undefined → empty
    expect(lines[2]).toBe("3,");
  });
});

describe("buildExportFilename", () => {
  it("builds filename with widget title only", () => {
    expect(buildExportFilename("Sales Chart", "csv")).toBe("sales-chart.csv");
  });

  it("builds filename with dashboard name and widget title", () => {
    expect(buildExportFilename("Sales Chart", "csv", "Q4 Report")).toBe(
      "q4-report_sales-chart.csv",
    );
  });

  it("handles png extension", () => {
    expect(buildExportFilename("My Graph", "png", "Dashboard 1")).toBe(
      "dashboard-1_my-graph.png",
    );
  });

  it("falls back to 'export' when widget title slugifies to empty", () => {
    expect(buildExportFilename("!!!", "csv")).toBe("export.csv");
  });

  it("falls back to widget-only when dashboard name is empty string", () => {
    expect(buildExportFilename("Widget", "csv", "")).toBe("widget.csv");
  });

  it("falls back to widget-only when dashboard name slugifies to empty", () => {
    expect(buildExportFilename("Widget", "csv", "---")).toBe("widget.csv");
  });

  it("falls back to widget-only when dashboard name is undefined", () => {
    expect(buildExportFilename("Widget", "csv", undefined)).toBe("widget.csv");
  });

  it("strips special characters from both names", () => {
    expect(
      buildExportFilename("Widget @#$% Title!", "csv", "Dashboard (v2)"),
    ).toBe("dashboard-v2_widget-title.csv");
  });

  it("handles numeric-only strings", () => {
    expect(buildExportFilename("123", "csv", "456")).toBe("456_123.csv");
  });
});

describe("triggerDownload", () => {
  it("is a function", () => {
    expect(typeof triggerDownload).toBe("function");
  });
});

describe("triggerSvgDownload", () => {
  it("is a function", () => {
    expect(typeof triggerSvgDownload).toBe("function");
  });
});

describe("buildExportFilename — svg extension", () => {
  it("builds filename with svg extension", () => {
    expect(buildExportFilename("Sales Chart", "svg", "Dashboard")).toBe(
      "dashboard_sales-chart.svg",
    );
  });
});
