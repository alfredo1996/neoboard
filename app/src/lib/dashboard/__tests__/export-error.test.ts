import { describe, it, expect } from "vitest";
import { ExportError, classifyExportError } from "../export-error";

describe("classifyExportError", () => {
  it("classifies 401 as permission denied", () => {
    const result = classifyExportError(new ExportError("nope", 401));
    expect(result.title).toBe("Permission denied");
    expect(result.description).toBe(
      "You don't have permission to export this dashboard.",
    );
  });

  it("classifies 403 as permission denied", () => {
    const result = classifyExportError(new ExportError("nope", 403));
    expect(result.title).toBe("Permission denied");
    expect(result.description).toBe(
      "You don't have permission to export this dashboard.",
    );
  });

  it("classifies 404 as dashboard not found", () => {
    const result = classifyExportError(new ExportError("gone", 404));
    expect(result.title).toBe("Dashboard not found");
    expect(result.description).toBe("This dashboard may have been deleted.");
  });

  it("classifies 5xx as server error", () => {
    const result = classifyExportError(new ExportError("boom", 500));
    expect(result.title).toBe("Export failed");
    expect(result.description).toBe("Server error — please try again.");
  });

  it("classifies 503 as server error", () => {
    const result = classifyExportError(new ExportError("boom", 503));
    expect(result.title).toBe("Export failed");
    expect(result.description).toBe("Server error — please try again.");
  });

  it("classifies network/throw (no status) as connectivity issue", () => {
    const result = classifyExportError(new TypeError("Failed to fetch"));
    expect(result.title).toBe("Export failed");
    expect(result.description).toBe("Couldn't reach the server.");
  });

  it("falls back for other 4xx with the error message", () => {
    const result = classifyExportError(new ExportError("Bad request", 400));
    expect(result.title).toBe("Export failed");
    expect(result.description).toBe("Bad request");
  });

  it("falls back for non-Error throws with a generic message", () => {
    const result = classifyExportError("not an error");
    expect(result.title).toBe("Export failed");
    expect(result.description).toBe("Something went wrong.");
  });
});

describe("ExportError", () => {
  it("carries the HTTP status and message", () => {
    const err = new ExportError("Boom", 500);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Boom");
    expect(err.status).toBe(500);
    expect(err.name).toBe("ExportError");
  });
});
