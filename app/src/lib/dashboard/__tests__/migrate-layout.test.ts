import { describe, it, expect } from "vitest";
import { migrateLayout } from "../migrate-layout";
import type { DashboardLayoutV1, DashboardLayoutV2 } from "@/lib/db/schema";

describe("migrateLayout", () => {
  it("returns a default v2 layout with one empty page when raw is null", () => {
    const result = migrateLayout(null);
    expect(result.version).toBe(2);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toEqual({
      id: "page-1",
      title: "Page 1",
      widgets: [],
      gridLayout: [],
    });
  });

  it("returns a default v2 layout when raw is undefined", () => {
    const result = migrateLayout(undefined);
    expect(result.version).toBe(2);
    expect(result.pages).toHaveLength(1);
  });

  it("returns the same object when raw is already v2", () => {
    const v2: DashboardLayoutV2 = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Main",
          widgets: [],
          gridLayout: [],
        },
      ],
    };
    expect(migrateLayout(v2)).toBe(v2);
  });

  it("wraps a v1 layout into a single default page", () => {
    const v1 = {
      widgets: [{ id: "w1" }],
      gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
    } as unknown as DashboardLayoutV1;
    const result = migrateLayout(v1);
    expect(result.version).toBe(2);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].widgets).toEqual([{ id: "w1" }]);
    expect(result.pages[0].gridLayout).toEqual([
      { i: "w1", x: 0, y: 0, w: 4, h: 3 },
    ]);
  });

  it("handles v1 layouts with no widgets/gridLayout fields", () => {
    const result = migrateLayout({} as DashboardLayoutV1);
    expect(result.version).toBe(2);
    expect(result.pages[0].widgets).toEqual([]);
    expect(result.pages[0].gridLayout).toEqual([]);
  });

  it("does NOT treat a malformed object (version=2 but no pages array) as v2", () => {
    const malformed = {
      version: 2,
      pages: "not-an-array",
    } as unknown as DashboardLayoutV1;
    const result = migrateLayout(malformed);
    // Falls through to the v1 wrapper path.
    expect(result.version).toBe(2);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].id).toBe("page-1");
  });
});
