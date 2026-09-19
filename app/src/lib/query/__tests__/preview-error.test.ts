import { describe, it, expect } from "vitest";
import {
  mapPreviewError,
  PREVIEW_WRITE_NOT_ALLOWED_MESSAGE,
} from "../preview-error";

/** The Error the API client throws: the envelope's `details` ride along on it. */
const apiError = (message: string, details?: Record<string, unknown>) =>
  Object.assign(new Error(message), { details });

describe("mapPreviewError (#1043)", () => {
  it("maps an error the connector flagged as a blocked write to the write message", () => {
    expect(
      mapPreviewError(
        apiError("whatever the driver said", { blockedWrite: true }),
      ),
    ).toBe(PREVIEW_WRITE_NOT_ALLOWED_MESSAGE);
  });

  it("does not read the message: only the connector knows what its driver means (#1903)", () => {
    expect(
      mapPreviewError(apiError("Writing is not allowed in a read-only mode")),
    ).toBeNull();
  });

  it("returns null for any other error so the raw message shows", () => {
    expect(mapPreviewError(apiError("no such column"))).toBeNull();
    expect(mapPreviewError(apiError("x", { column: "rating" }))).toBeNull();
    expect(mapPreviewError(apiError("x", { blockedWrite: "yes" }))).toBeNull();
  });

  it("returns null for a missing error", () => {
    expect(mapPreviewError(undefined)).toBeNull();
    expect(mapPreviewError(null)).toBeNull();
  });

  it("the message names no connector and says what to do instead", () => {
    expect(PREVIEW_WRITE_NOT_ALLOWED_MESSAGE).toMatch(/Form widget/);
  });
});
