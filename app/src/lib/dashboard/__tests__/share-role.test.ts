import { describe, it, expect } from "vitest";
import { isEditorShareNoOp } from "../share-role";

describe("isEditorShareNoOp (#1056)", () => {
  it("is true for an Editor share on a reader (writes are capped)", () => {
    expect(isEditorShareNoOp("reader", "editor")).toBe(true);
  });

  it("is false for a Viewer share on a reader", () => {
    expect(isEditorShareNoOp("reader", "viewer")).toBe(false);
  });

  it("is false for Editor shares on creators/admins (they can write)", () => {
    expect(isEditorShareNoOp("creator", "editor")).toBe(false);
    expect(isEditorShareNoOp("admin", "editor")).toBe(false);
  });
});
