import { describe, it, expect } from "vitest";
import { SaveError, classifySaveError } from "../save-error";

describe("classifySaveError", () => {
  it("classifies 401 as permission denied", () => {
    const result = classifySaveError(new SaveError("nope", 401));
    expect(result.title).toBe("Save failed");
    expect(result.description).toBe(
      "You don't have permission to update this dashboard.",
    );
  });

  it("classifies 403 as permission denied", () => {
    const result = classifySaveError(new SaveError("nope", 403));
    expect(result.title).toBe("Save failed");
    expect(result.description).toBe(
      "You don't have permission to update this dashboard.",
    );
  });

  it("classifies 404 as dashboard not found", () => {
    const result = classifySaveError(new SaveError("gone", 404));
    expect(result.title).toBe("Save failed");
    expect(result.description).toBe("This dashboard may have been deleted.");
  });

  it("classifies 409 as save conflict (version)", () => {
    const result = classifySaveError(new SaveError("conflict", 409));
    expect(result.title).toBe("Save conflict");
    expect(result.description).toBe(
      "Another change was saved first — please reload.",
    );
  });

  it("classifies 5xx as server error", () => {
    const result = classifySaveError(new SaveError("boom", 500));
    expect(result.title).toBe("Save failed");
    expect(result.description).toBe("Server error — your change wasn't saved.");
  });

  it("classifies 503 as server error", () => {
    const result = classifySaveError(new SaveError("boom", 503));
    expect(result.title).toBe("Save failed");
    expect(result.description).toBe("Server error — your change wasn't saved.");
  });

  it("classifies network/throw (non-SaveError) as connectivity issue", () => {
    const result = classifySaveError(new TypeError("Failed to fetch"));
    expect(result.title).toBe("Save failed");
    expect(result.description).toBe(
      "Couldn't reach the server — your change wasn't saved.",
    );
  });

  it("falls back for other 4xx with the error message", () => {
    const result = classifySaveError(new SaveError("Bad request", 400));
    expect(result.title).toBe("Save failed");
    expect(result.description).toBe("Bad request");
  });

  it("falls back for non-Error throws with a generic message", () => {
    const result = classifySaveError("not an error");
    expect(result.title).toBe("Save failed");
    expect(result.description).toBe(
      "Something went wrong — your change wasn't saved.",
    );
  });
});

describe("SaveError", () => {
  it("carries the HTTP status and message", () => {
    const err = new SaveError("Boom", 500);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Boom");
    expect(err.status).toBe(500);
    expect(err.name).toBe("SaveError");
  });
});
