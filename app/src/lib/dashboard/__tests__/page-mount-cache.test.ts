import { describe, it, expect } from "vitest";
import { touchPage, PAGE_MOUNT_CAP } from "../page-mount-cache";

const clean = () => false;

describe("touchPage (#1475)", () => {
  it("never keeps more than the cap mounted, dropping the least recently visited", () => {
    let order: number[] = [];
    for (const i of [0, 1, 2, 3]) order = touchPage(order, i, clean);
    expect(order).toHaveLength(PAGE_MOUNT_CAP);
    expect(order).toEqual([1, 2, 3]);
  });

  it("evicts by last visit, not by insertion", () => {
    let order: number[] = [];
    for (const i of [0, 1, 2, 0, 3]) order = touchPage(order, i, clean);
    expect(order).toEqual([2, 0, 3]);
  });

  it("keeps a page with unsaved form input even when it is the oldest", () => {
    let order: number[] = [];
    for (const i of [0, 1, 2, 3]) order = touchPage(order, i, (p) => p === 0);
    expect(order).toEqual([0, 2, 3]);
  });

  it("never evicts the page just opened", () => {
    expect(touchPage([0, 1, 2], 3, () => true)).toContain(3);
  });
});
