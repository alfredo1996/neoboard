import { describe, it, expect } from "vitest";
import { applyTransforms } from "../data-transforms";
import type { Transform } from "../data-transforms";

const sampleData = [
  { name: "Alice", department: "Engineering", salary: 120000, start: "2020-01-15" },
  { name: "Bob", department: "Sales", salary: 80000, start: "2021-06-01" },
  { name: "Charlie", department: "Engineering", salary: 110000, start: "2019-03-20" },
  { name: "Diana", department: "Sales", salary: 95000, start: "2022-11-10" },
  { name: "Eve", department: "Engineering", salary: 130000, start: "2018-07-25" },
];

describe("applyTransforms", () => {
  it("returns data unchanged when transforms array is empty", () => {
    expect(applyTransforms(sampleData, [])).toEqual(sampleData);
  });

  it("returns empty array for empty data", () => {
    expect(applyTransforms([], [{ type: "limit", count: 5 }])).toEqual([]);
  });

  describe("filter", () => {
    it("filters rows by numeric > condition", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "salary", operator: ">", value: 100000 },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(3);
      expect(result.every((r) => (r.salary as number) > 100000)).toBe(true);
    });

    it("filters rows by string == condition", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "department", operator: "==", value: "Sales" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.department === "Sales")).toBe(true);
    });

    it("filters rows by contains condition", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "name", operator: "contains", value: "li" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(2); // Alice, Charlie
    });

    it("filters rows by != condition", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "department", operator: "!=", value: "Sales" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(3);
    });
  });

  describe("sort", () => {
    it("sorts ascending by numeric column", () => {
      const transforms: Transform[] = [
        { type: "sort", column: "salary", direction: "asc" },
      ];
      const result = applyTransforms(sampleData, transforms);
      const salaries = result.map((r) => r.salary);
      expect(salaries).toEqual([80000, 95000, 110000, 120000, 130000]);
    });

    it("sorts descending by string column", () => {
      const transforms: Transform[] = [
        { type: "sort", column: "name", direction: "desc" },
      ];
      const result = applyTransforms(sampleData, transforms);
      const names = result.map((r) => r.name);
      expect(names).toEqual(["Eve", "Diana", "Charlie", "Bob", "Alice"]);
    });
  });

  describe("groupBy", () => {
    it("groups by column with count aggregation", () => {
      const transforms: Transform[] = [
        { type: "groupBy", column: "department", aggregations: [{ column: "salary", fn: "count" }] },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(2);
      const eng = result.find((r) => r.department === "Engineering");
      expect(eng?.salary_count).toBe(3);
      const sales = result.find((r) => r.department === "Sales");
      expect(sales?.salary_count).toBe(2);
    });

    it("groups by column with sum aggregation", () => {
      const transforms: Transform[] = [
        { type: "groupBy", column: "department", aggregations: [{ column: "salary", fn: "sum" }] },
      ];
      const result = applyTransforms(sampleData, transforms);
      const eng = result.find((r) => r.department === "Engineering");
      expect(eng?.salary_sum).toBe(360000);
    });

    it("groups by column with avg aggregation", () => {
      const transforms: Transform[] = [
        { type: "groupBy", column: "department", aggregations: [{ column: "salary", fn: "avg" }] },
      ];
      const result = applyTransforms(sampleData, transforms);
      const eng = result.find((r) => r.department === "Engineering");
      expect(eng?.salary_avg).toBe(120000);
    });

    it("groups by column with min/max aggregation", () => {
      const transforms: Transform[] = [
        {
          type: "groupBy",
          column: "department",
          aggregations: [
            { column: "salary", fn: "min" },
            { column: "salary", fn: "max" },
          ],
        },
      ];
      const result = applyTransforms(sampleData, transforms);
      const eng = result.find((r) => r.department === "Engineering");
      expect(eng?.salary_min).toBe(110000);
      expect(eng?.salary_max).toBe(130000);
    });
  });

  describe("calculatedColumn", () => {
    it("adds a calculated column with arithmetic expression", () => {
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "bonus", expression: "salary * 0.1" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0].bonus).toBe(12000);
      expect(result[1].bonus).toBe(8000);
    });

    it("adds a calculated column with addition", () => {
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "adjusted", expression: "salary + 5000" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0].adjusted).toBe(125000);
    });
  });

  describe("renameColumns", () => {
    it("renames columns", () => {
      const transforms: Transform[] = [
        { type: "renameColumns", mapping: { name: "Employee", salary: "Annual Salary" } },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0]["Employee"]).toBe("Alice");
      expect(result[0]["Annual Salary"]).toBe(120000);
      expect(result[0]["name"]).toBeUndefined();
      expect(result[0]["salary"]).toBeUndefined();
    });
  });

  describe("limit", () => {
    it("limits the number of rows", () => {
      const transforms: Transform[] = [{ type: "limit", count: 3 }];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(3);
    });

    it("returns all rows when limit exceeds data length", () => {
      const transforms: Transform[] = [{ type: "limit", count: 100 }];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(5);
    });
  });

  describe("pipeline (multiple transforms)", () => {
    it("applies transforms in order: filter then sort then limit", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "department", operator: "==", value: "Engineering" },
        { type: "sort", column: "salary", direction: "desc" },
        { type: "limit", count: 2 },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Eve");
      expect(result[1].name).toBe("Alice");
    });

    it("renames then filters by new name", () => {
      const transforms: Transform[] = [
        { type: "renameColumns", mapping: { department: "dept" } },
        { type: "filter", column: "dept", operator: "==", value: "Sales" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(2);
      expect(result[0].dept).toBe("Sales");
    });
  });
});
