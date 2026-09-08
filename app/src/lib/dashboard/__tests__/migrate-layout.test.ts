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
          title: "Overview",
          widgets: [
            {
              id: "w1",
              chartType: "bar",
              connectionId: "c1",
              query: "MATCH (n) RETURN n",
            },
          ],
          gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
        },
        {
          id: "p2",
          title: "Details",
          widgets: [],
          gridLayout: [],
        },
      ],
    };
    // Identity, not deep equality: a v2 layout is passed straight through,
    // so multi-page layouts are never rebuilt or collapsed into one page.
    expect(migrateLayout(v2)).toBe(v2);
  });

  it("wraps a v1 layout into a single default page", () => {
    const v1: DashboardLayoutV1 = {
      widgets: [
        {
          id: "w1",
          chartType: "table",
          connectionId: "c1",
          query: "SELECT 1",
        },
      ],
      gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
    };

    const result = migrateLayout(v1);
    expect(result.version).toBe(2);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].id).toBe("page-1");
    expect(result.pages[0].title).toBe("Page 1");
    expect(result.pages[0].widgets).toEqual(v1.widgets);
    expect(result.pages[0].gridLayout).toEqual(v1.gridLayout);
  });

  it("handles v1 layouts with no widgets/gridLayout fields", () => {
    // Exercises the `?? []` fallbacks — the fields are absent, not empty.
    const result = migrateLayout({} as DashboardLayoutV1);
    expect(result.version).toBe(2);
    expect(result.pages[0].widgets).toEqual([]);
    expect(result.pages[0].gridLayout).toEqual([]);
  });

  it("handles a v1 layout whose widgets/gridLayout are empty arrays", () => {
    const v1: DashboardLayoutV1 = { widgets: [], gridLayout: [] };
    const result = migrateLayout(v1);
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
