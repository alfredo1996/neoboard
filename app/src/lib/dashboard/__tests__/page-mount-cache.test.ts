import { describe, it, expect } from "vitest";
import { touchPage, PAGE_MOUNT_CAP } from "../page-mount-cache";

const noForm = () => false;

describe("touchPage (#1475)", () => {
  it("never keeps more than the cap mounted, dropping the least recently visited", () => {
    let order: string[] = [];
    for (const i of ["a", "b", "c", "d"]) order = touchPage(order, i, noForm);
    expect(order).toHaveLength(PAGE_MOUNT_CAP);
    expect(order).toEqual(["b", "c", "d"]);
  });

  it("evicts by last visit, not by insertion", () => {
    let order: string[] = [];
    for (const i of ["a", "b", "c", "a", "d"])
      order = touchPage(order, i, noForm);
    expect(order).toEqual(["c", "a", "d"]);
  });

  it("never evicts a page with a form, however many pages are visited after it", () => {
    let order: string[] = [];
    for (const i of ["f", "b", "c", "d", "e", "g"]) {
      order = touchPage(order, i, (p) => p === "f");
    }
    expect(order).toContain("f");
  });

  it("bounds the form-free pages while form pages stay", () => {
    const hasForm = (p: string) => p.startsWith("f");
    let order: string[] = [];
    for (const i of ["f1", "f2", "a", "b", "c", "d", "f3"]) {
      order = touchPage(order, i, hasForm);
    }
    expect(order.filter((p) => !hasForm(p))).toEqual(["b", "c", "d"]);
    expect(order.filter(hasForm)).toEqual(["f1", "f2", "f3"]);
  });

  it("never evicts the page just opened", () => {
    expect(touchPage(["a", "b", "c"], "d", noForm)).toContain("d");
  });
});
