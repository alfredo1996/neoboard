import { describe, it, expect } from "vitest";
import {
  touchPage,
  pinForm,
  isFormDirty,
  PAGE_MOUNT_CAP,
} from "../page-mount-cache";

const clean = () => false;

describe("touchPage (#1475)", () => {
  it("never keeps more than the cap mounted, dropping the least recently visited", () => {
    let order: string[] = [];
    for (const i of ["a", "b", "c", "d"]) order = touchPage(order, i, clean);
    expect(order).toHaveLength(PAGE_MOUNT_CAP);
    expect(order).toEqual(["b", "c", "d"]);
  });

  it("evicts by last visit, not by insertion", () => {
    let order: string[] = [];
    for (const i of ["a", "b", "c", "a", "d"])
      order = touchPage(order, i, clean);
    expect(order).toEqual(["c", "a", "d"]);
  });

  it("keeps a page with unsaved form input even when it is the oldest", () => {
    let order: string[] = [];
    for (const i of ["a", "b", "c", "d"]) {
      order = touchPage(order, i, (p) => p === "a");
    }
    expect(order).toEqual(["a", "c", "d"]);
  });

  it("never evicts the page just opened", () => {
    expect(touchPage(["a", "b", "c"], "d", () => true)).toContain("d");
  });
});

describe("pinForm", () => {
  it("counts pins, so one release does not unpin a second copy of the form", () => {
    const releaseCard = pinForm("w");
    const releaseFullscreen = pinForm("w");
    releaseFullscreen();
    expect(isFormDirty("w")).toBe(true);
    releaseCard();
    expect(isFormDirty("w")).toBe(false);
  });
});
