import { describe, it, expect } from "vitest";
import {
  mapPreviewError,
  PREVIEW_WRITE_NOT_ALLOWED_MESSAGE,
} from "../preview-error";

describe("mapPreviewError (#1043)", () => {
  it("maps a PostgreSQL wrapped-write syntax error to the write message", () => {
    // DELETE wrapped as SELECT * FROM (DELETE …) AS __preview
    expect(mapPreviewError('syntax error at or near "DELETE"')).toBe(
      PREVIEW_WRITE_NOT_ALLOWED_MESSAGE,
    );
    expect(mapPreviewError('syntax error at or near "UPDATE"')).toBe(
      PREVIEW_WRITE_NOT_ALLOWED_MESSAGE,
    );
    expect(mapPreviewError('syntax error at or near "INSERT"')).toBe(
      PREVIEW_WRITE_NOT_ALLOWED_MESSAGE,
    );
  });

  it("maps a Neo4j read-access-mode write error to the write message", () => {
    expect(
      mapPreviewError(
        "Neo.ClientError.Request.Invalid: Writing in read access mode not allowed.",
      ),
    ).toBe(PREVIEW_WRITE_NOT_ALLOWED_MESSAGE);
  });

  it("maps a PostgreSQL read-only transaction violation to the write message", () => {
    expect(
      mapPreviewError("cannot execute DELETE in a read-only transaction"),
    ).toBe(PREVIEW_WRITE_NOT_ALLOWED_MESSAGE);
  });

  it("returns null for a genuine (non-write) syntax error so the raw message shows", () => {
    expect(mapPreviewError('syntax error at or near "FROMM"')).toBeNull();
  });

  it("returns null for an unrelated error", () => {
    expect(mapPreviewError('column "foo" does not exist')).toBeNull();
  });

  it("returns null for empty/undefined input", () => {
    expect(mapPreviewError(undefined)).toBeNull();
    expect(mapPreviewError("")).toBeNull();
  });
});
