import { describe, it, expect } from "vitest";
import { migrateLayout } from "@/lib/migrate-layout";
import type { DashboardLayoutV1, DashboardLayoutV2 } from "@/lib/db/schema";

describe("migrateLayout", () => {
  it("returns a default empty v2 layout when given null", () => {
    const result = migrateLayout(null);
    expect(result.version).toBe(2);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].widgets).toEqual([]);
    expect(result.pages[0].gridLayout).toEqual([]);
  });

  it("returns a default empty v2 layout when given undefined", () => {
    const result = migrateLayout(undefined);
    expect(result.version).toBe(2);
    expect(result.pages).toHaveLength(1);
  });

  it("passes a valid v2 layout through unchanged", () => {
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

    const result = migrateLayout(v2);
    expect(result).toEqual(v2);
  });

  it("wraps a v1 layout in a single page", () => {
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
    expect(result.pages[0].widgets).toEqual(v1.widgets);
    expect(result.pages[0].gridLayout).toEqual(v1.gridLayout);
    expect(result.pages[0].id).toBe("page-1");
    expect(result.pages[0].title).toBe("Page 1");
  });

  it("handles a v1 layout with empty arrays", () => {
    const v1: DashboardLayoutV1 = { widgets: [], gridLayout: [] };
    const result = migrateLayout(v1);
    expect(result.version).toBe(2);
    expect(result.pages[0].widgets).toEqual([]);
    expect(result.pages[0].gridLayout).toEqual([]);
  });
});
