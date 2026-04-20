import { describe, it, expect } from "vitest";
import {
  applyTransforms,
  computeColumnsPerStep,
} from "@/lib/query/data-transforms";
import type { Transform } from "@/lib/query/data-transforms";

const sampleData = [
  {
    name: "Alice",
    department: "Engineering",
    salary: 120000,
    start: "2020-01-15",
  },
  { name: "Bob", department: "Sales", salary: 80000, start: "2021-06-01" },
  {
    name: "Charlie",
    department: "Engineering",
    salary: 110000,
    start: "2019-03-20",
  },
  { name: "Diana", department: "Sales", salary: 95000, start: "2022-11-10" },
  {
    name: "Eve",
    department: "Engineering",
    salary: 130000,
    start: "2018-07-25",
  },
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
        {
          type: "filter",
          column: "department",
          operator: "==",
          value: "Sales",
        },
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
        {
          type: "filter",
          column: "department",
          operator: "!=",
          value: "Sales",
        },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(3);
    });

    it("filters rows by >= condition", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "salary", operator: ">=", value: 120000 },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(2); // Alice (120k), Eve (130k)
    });

    it("filters rows by < condition", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "salary", operator: "<", value: 100000 },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(2); // Bob (80k), Diana (95k)
    });

    it("filters rows by <= condition", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "salary", operator: "<=", value: 80000 },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(1); // Bob
    });

    it("filters rows by not_contains condition", () => {
      const transforms: Transform[] = [
        {
          type: "filter",
          column: "name",
          operator: "not_contains",
          value: "li",
        },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(3); // Bob, Diana, Eve
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
        {
          type: "groupBy",
          column: "department",
          aggregations: [{ column: "salary", fn: "count" }],
        },
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
        {
          type: "groupBy",
          column: "department",
          aggregations: [{ column: "salary", fn: "sum" }],
        },
      ];
      const result = applyTransforms(sampleData, transforms);
      const eng = result.find((r) => r.department === "Engineering");
      expect(eng?.salary_sum).toBe(360000);
    });

    it("groups by column with avg aggregation", () => {
      const transforms: Transform[] = [
        {
          type: "groupBy",
          column: "department",
          aggregations: [{ column: "salary", fn: "avg" }],
        },
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
        {
          type: "calculatedColumn",
          name: "adjusted",
          expression: "salary + 5000",
        },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0].adjusted).toBe(125000);
    });

    it("adds a calculated column with subtraction", () => {
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "net", expression: "salary - 20000" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0].net).toBe(100000);
    });

    it("adds a calculated column with division", () => {
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "monthly",
          expression: "salary / 12",
        },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0].monthly).toBe(10000);
    });

    it("returns Infinity for division by zero", () => {
      const data = [{ a: 10, b: 0 }];
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "result", expression: "a / b" },
      ];
      const result = applyTransforms(data, transforms);
      expect(result[0].result).toBe(Infinity);
    });

    it("respects operator precedence: * before +", () => {
      const data = [{ a: 2, b: 3, c: 4 }];
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "result", expression: "a + b * c" },
      ];
      const result = applyTransforms(data, transforms);
      // 2 + (3 * 4) = 14, NOT (2 + 3) * 4 = 20
      expect(result[0].result).toBe(14);
    });

    it("respects operator precedence: / before -", () => {
      const data = [{ a: 10, b: 6, c: 2 }];
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "result", expression: "a - b / c" },
      ];
      const result = applyTransforms(data, transforms);
      // 10 - (6 / 2) = 7, NOT (10 - 6) / 2 = 2
      expect(result[0].result).toBe(7);
    });

    it("handles mixed precedence: a + b * c - d / e", () => {
      const data = [{ a: 1, b: 2, c: 3, d: 8, e: 4 }];
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "result",
          expression: "a + b * c - d / e",
        },
      ];
      const result = applyTransforms(data, transforms);
      // 1 + (2*3) - (8/4) = 1 + 6 - 2 = 5
      expect(result[0].result).toBe(5);
    });

    it("returns null for invalid expression", () => {
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "bad",
          expression: "nonexistent_column * 2",
        },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0].bad).toBeNull();
    });

    it("skips empty expression (incomplete transform)", () => {
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "empty", expression: "" },
      ];
      const result = applyTransforms(sampleData, transforms);
      // Incomplete transform is skipped — column not added
      expect(result[0]).not.toHaveProperty("empty");
    });

    it("handles column-to-column operations", () => {
      const data = [{ a: 10, b: 3 }];
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "sum", expression: "a + b" },
      ];
      const result = applyTransforms(data, transforms);
      expect(result[0].sum).toBe(13);
    });

    it("handles negative numeric literals", () => {
      const data = [{ price: 100 }];
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "discounted",
          expression: "price + -10",
        },
      ];
      const result = applyTransforms(data, transforms);
      expect(result[0].discounted).toBe(90);
    });

    it("handles leading negative literal", () => {
      const data = [{ x: 5 }];
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "neg", expression: "-1 * x" },
      ];
      const result = applyTransforms(data, transforms);
      expect(result[0].neg).toBe(-5);
    });

    it("handles hyphenated column names", () => {
      const data = [{ "revenue-total": 200, "cost-total": 80 }];
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "profit",
          expression: "revenue-total - cost-total",
        },
      ];
      const result = applyTransforms(data, transforms);
      expect(result[0].profit).toBe(120);
    });

    it("handles underscored column names with hyphens", () => {
      const data = [{ "net-revenue": 500 }];
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "half",
          expression: "net-revenue * 0.5",
        },
      ];
      const result = applyTransforms(data, transforms);
      expect(result[0].half).toBe(250);
    });
  });

  describe("renameColumns", () => {
    it("renames columns", () => {
      const transforms: Transform[] = [
        {
          type: "renameColumns",
          mapping: { name: "Employee", salary: "Annual Salary" },
        },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0]["Employee"]).toBe("Alice");
      expect(result[0]["Annual Salary"]).toBe(120000);
      expect(result[0]["name"]).toBeUndefined();
      expect(result[0]["salary"]).toBeUndefined();
    });

    it("preserves unmapped columns", () => {
      const transforms: Transform[] = [
        { type: "renameColumns", mapping: { name: "Employee" } },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0]["Employee"]).toBe("Alice");
      expect(result[0]["department"]).toBe("Engineering");
      expect(result[0]["salary"]).toBe(120000);
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
        {
          type: "filter",
          column: "department",
          operator: "==",
          value: "Engineering",
        },
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

  // ---------------------------------------------------------------------------
  // Parameter-aware transforms
  // ---------------------------------------------------------------------------

  describe("parameter-aware filter", () => {
    it("resolves paramRef from paramValues for == filter", () => {
      const transforms: Transform[] = [
        {
          type: "filter",
          column: "department",
          operator: "==",
          value: "",
          paramRef: "dept",
        },
      ];
      const result = applyTransforms(sampleData, transforms, { dept: "Sales" });
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.department === "Sales")).toBe(true);
    });

    it("resolves paramRef for numeric > filter", () => {
      const transforms: Transform[] = [
        {
          type: "filter",
          column: "salary",
          operator: ">",
          value: 0,
          paramRef: "min_salary",
        },
      ];
      const result = applyTransforms(sampleData, transforms, {
        min_salary: 100000,
      });
      expect(result).toHaveLength(3);
      expect(result.every((r) => (r.salary as number) > 100000)).toBe(true);
    });

    it("falls back to static value when paramRef is not in paramValues", () => {
      const transforms: Transform[] = [
        {
          type: "filter",
          column: "department",
          operator: "==",
          value: "Engineering",
          paramRef: "missing",
        },
      ];
      const result = applyTransforms(sampleData, transforms, {});
      expect(result).toHaveLength(3);
      expect(result.every((r) => r.department === "Engineering")).toBe(true);
    });

    it("falls back to static value when no paramValues provided", () => {
      const transforms: Transform[] = [
        {
          type: "filter",
          column: "department",
          operator: "==",
          value: "Sales",
          paramRef: "dept",
        },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(2);
    });

    it("resolves paramRef for contains filter", () => {
      const transforms: Transform[] = [
        {
          type: "filter",
          column: "name",
          operator: "contains",
          value: "",
          paramRef: "search",
        },
      ];
      const result = applyTransforms(sampleData, transforms, { search: "li" });
      expect(result).toHaveLength(2); // Alice, Charlie
    });
  });

  describe("parameter-aware calculatedColumn", () => {
    it("resolves $param_xxx in expressions", () => {
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "bonus",
          expression: "salary * $param_rate",
        },
      ];
      const result = applyTransforms(sampleData, transforms, { rate: 0.1 });
      expect(result[0].bonus).toBe(12000); // 120000 * 0.1
      expect(result[1].bonus).toBe(8000); // 80000 * 0.1
    });

    it("returns null when referenced param is missing", () => {
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "bonus",
          expression: "salary * $param_missing",
        },
      ];
      const result = applyTransforms(sampleData, transforms, {});
      expect(result[0].bonus).toBeNull();
    });

    it("resolves $param_xxx in addition expressions", () => {
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "adjusted",
          expression: "salary + $param_raise",
        },
      ];
      const result = applyTransforms(sampleData, transforms, { raise: 5000 });
      expect(result[0].adjusted).toBe(125000);
    });

    it("works without paramValues (backward compatible)", () => {
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "doubled", expression: "salary * 2" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0].doubled).toBe(240000);
    });
  });

  describe("edge cases", () => {
    it("filter on non-existent column returns no rows for == check", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "nonexistent", operator: "==", value: "x" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(0);
    });

    it("filter on non-existent column returns all rows for != check", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "nonexistent", operator: "!=", value: "x" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(5);
    });

    it("sort handles null/undefined values without crashing", () => {
      const data = [
        { name: "Alice", score: 10 },
        { name: "Bob", score: null },
        { name: "Charlie" }, // score is undefined
        { name: "Diana", score: 5 },
      ];
      const transforms: Transform[] = [
        { type: "sort", column: "score", direction: "asc" },
      ];
      const result = applyTransforms(data, transforms);
      expect(result).toHaveLength(4);
    });

    it("groupBy with multiple aggregations on same column", () => {
      const transforms: Transform[] = [
        {
          type: "groupBy",
          column: "department",
          aggregations: [
            { column: "salary", fn: "sum" },
            { column: "salary", fn: "avg" },
            { column: "salary", fn: "count" },
          ],
        },
      ];
      const result = applyTransforms(sampleData, transforms);
      const eng = result.find((r) => r.department === "Engineering");
      expect(eng?.salary_sum).toBe(360000);
      expect(eng?.salary_avg).toBe(120000);
      expect(eng?.salary_count).toBe(3);
    });

    it("calculated column with multiple $param_ tokens", () => {
      const data = [{ base: 100 }];
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "total",
          expression: "base * $param_rate + $param_bonus",
        },
      ];
      const result = applyTransforms(data, transforms, { rate: 2, bonus: 50 });
      expect(result[0].total).toBe(250); // 100 * 2 + 50
    });

    it("filter with paramRef pointing to null param value uses static value", () => {
      const transforms: Transform[] = [
        {
          type: "filter",
          column: "department",
          operator: "==",
          value: "Sales",
          paramRef: "dept",
        },
      ];
      const result = applyTransforms(sampleData, transforms, { dept: null });
      // null param → falls back to static value "Sales"
      expect(result).toHaveLength(2);
    });

    it("limit count of 0 is skipped (incomplete transform)", () => {
      const transforms: Transform[] = [{ type: "limit", count: 0 }];
      const result = applyTransforms(sampleData, transforms);
      // Limit 0 is treated as incomplete — data passes through
      expect(result).toHaveLength(5);
    });
  });

  describe("pipeline with parameters", () => {
    it("filter by param then sort then limit", () => {
      const transforms: Transform[] = [
        {
          type: "filter",
          column: "salary",
          operator: ">=",
          value: 0,
          paramRef: "threshold",
        },
        { type: "sort", column: "salary", direction: "desc" },
        { type: "limit", count: 2 },
      ];
      const result = applyTransforms(sampleData, transforms, {
        threshold: 110000,
      });
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Eve"); // 130k
      expect(result[1].name).toBe("Alice"); // 120k
    });

    it("calculated column with param then filter", () => {
      const transforms: Transform[] = [
        {
          type: "calculatedColumn",
          name: "bonus",
          expression: "salary * $param_rate",
        },
        { type: "filter", column: "bonus", operator: ">", value: 10000 },
      ];
      const result = applyTransforms(sampleData, transforms, { rate: 0.1 });
      expect(result).toHaveLength(3); // Charlie (11k), Alice (12k), Eve (13k)
    });
  });

  // ---------------------------------------------------------------------------
  // Pipeline ordering impact
  // ---------------------------------------------------------------------------

  describe("pipeline ordering impact", () => {
    it("filter before groupBy → fewer groups than groupBy before filter", () => {
      // Filter first: keep only Engineering → groupBy → 1 group
      const filterFirst: Transform[] = [
        {
          type: "filter",
          column: "department",
          operator: "==",
          value: "Engineering",
        },
        {
          type: "groupBy",
          column: "department",
          aggregations: [{ column: "salary", fn: "count" }],
        },
      ];
      const r1 = applyTransforms(sampleData, filterFirst);
      expect(r1).toHaveLength(1);

      // GroupBy first: 2 groups → filter keeps only Engineering group
      const groupFirst: Transform[] = [
        {
          type: "groupBy",
          column: "department",
          aggregations: [{ column: "salary", fn: "count" }],
        },
        {
          type: "filter",
          column: "department",
          operator: "==",
          value: "Engineering",
        },
      ];
      const r2 = applyTransforms(sampleData, groupFirst);
      expect(r2).toHaveLength(1);
      // Both produce 1 row but groupBy-first preserves the count from all data
      expect(r2[0].salary_count).toBe(3);
    });

    it("sort before limit gives top-N; limit before sort gives arbitrary N sorted", () => {
      // Sort desc then limit 2 → highest salaries
      const sortFirst: Transform[] = [
        { type: "sort", column: "salary", direction: "desc" },
        { type: "limit", count: 2 },
      ];
      const r1 = applyTransforms(sampleData, sortFirst);
      expect(r1).toHaveLength(2);
      expect(r1[0].name).toBe("Eve"); // 130k
      expect(r1[1].name).toBe("Alice"); // 120k

      // Limit 2 then sort desc → first 2 rows (Alice, Bob) sorted
      const limitFirst: Transform[] = [
        { type: "limit", count: 2 },
        { type: "sort", column: "salary", direction: "desc" },
      ];
      const r2 = applyTransforms(sampleData, limitFirst);
      expect(r2).toHaveLength(2);
      expect(r2[0].name).toBe("Alice"); // 120k (first 2 rows are Alice, Bob)
      expect(r2[1].name).toBe("Bob"); // 80k
    });

    it("renameColumns before calculatedColumn — expression uses new names", () => {
      const transforms: Transform[] = [
        { type: "renameColumns", mapping: { salary: "pay" } },
        { type: "calculatedColumn", name: "bonus", expression: "pay * 0.1" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0].bonus).toBe(12000); // pay (renamed from salary) * 0.1
      expect(result[0].pay).toBe(120000);
      expect(result[0]).not.toHaveProperty("salary");
    });

    it("filter before calculatedColumn — calc runs only on filtered rows", () => {
      const transforms: Transform[] = [
        {
          type: "filter",
          column: "department",
          operator: "==",
          value: "Sales",
        },
        { type: "calculatedColumn", name: "doubled", expression: "salary * 2" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(2); // only Sales rows
      expect(result.every((r) => r.doubled !== undefined)).toBe(true);
    });

    it("groupBy then sort — sorts aggregated results", () => {
      const transforms: Transform[] = [
        {
          type: "groupBy",
          column: "department",
          aggregations: [{ column: "salary", fn: "sum" }],
        },
        { type: "sort", column: "salary_sum", direction: "desc" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result[0].department).toBe("Engineering"); // 360k > 175k
      expect(result[1].department).toBe("Sales");
    });
  });

  // ---------------------------------------------------------------------------
  // Additional edge cases
  // ---------------------------------------------------------------------------

  describe("additional edge cases", () => {
    it("all rows filtered out → next transform gets empty array", () => {
      const transforms: Transform[] = [
        {
          type: "filter",
          column: "department",
          operator: "==",
          value: "Nonexistent",
        },
        { type: "sort", column: "salary", direction: "asc" },
        { type: "calculatedColumn", name: "bonus", expression: "salary * 0.1" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(0);
    });

    it("groupBy on single-value column → one group", () => {
      const data = [
        { dept: "A", val: 1 },
        { dept: "A", val: 2 },
        { dept: "A", val: 3 },
      ];
      const transforms: Transform[] = [
        {
          type: "groupBy",
          column: "dept",
          aggregations: [{ column: "val", fn: "sum" }],
        },
      ];
      const result = applyTransforms(data, transforms);
      expect(result).toHaveLength(1);
      expect(result[0].val_sum).toBe(6);
    });

    it("calculatedColumn referencing column created by prior calculatedColumn", () => {
      const data = [{ base: 100 }];
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "doubled", expression: "base * 2" },
        {
          type: "calculatedColumn",
          name: "quadrupled",
          expression: "doubled * 2",
        },
      ];
      const result = applyTransforms(data, transforms);
      expect(result[0].doubled).toBe(200);
      expect(result[0].quadrupled).toBe(400);
    });

    it("filter type coercion: string '42' == number 42", () => {
      const data = [
        { id: "42", name: "match" },
        { id: "99", name: "no" },
      ];
      const transforms: Transform[] = [
        { type: "filter", column: "id", operator: "==", value: 42 },
      ];
      const result = applyTransforms(data, transforms);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("match");
    });

    it("skips incomplete filter with empty value — data passes through", () => {
      const transforms: Transform[] = [
        { type: "filter", column: "department", operator: "==", value: "" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(5); // all rows pass through
    });

    it("skips incomplete calculatedColumn with empty expression", () => {
      const transforms: Transform[] = [
        { type: "calculatedColumn", name: "x", expression: "" },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(5);
      expect(result[0]).not.toHaveProperty("x"); // column not added
    });

    it("applies preceding transforms but skips incomplete ones", () => {
      const transforms: Transform[] = [
        { type: "sort", column: "salary", direction: "desc" },
        { type: "filter", column: "department", operator: "==", value: "" }, // skipped
        { type: "limit", count: 2 },
      ];
      const result = applyTransforms(sampleData, transforms);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Eve"); // sorted desc, filter skipped, limit 2
    });
  });
});

// ---------------------------------------------------------------------------
// computeColumnsPerStep — pipeline column propagation
// ---------------------------------------------------------------------------

describe("computeColumnsPerStep", () => {
  const cols = ["name", "department", "salary"];
  const sample = { name: "Alice", department: "Engineering", salary: 120000 };

  it("returns original columns when no transforms", () => {
    const result = computeColumnsPerStep(cols, []);
    expect(result).toEqual([cols]);
  });

  it("filter/sort/limit don't change columns", () => {
    const transforms: Transform[] = [
      { type: "filter", column: "salary", operator: ">", value: 100000 },
      { type: "sort", column: "name", direction: "asc" },
      { type: "limit", count: 5 },
    ];
    const result = computeColumnsPerStep(cols, transforms, sample);
    // All 4 entries should have the same columns
    expect(result).toHaveLength(4);
    for (const step of result) {
      expect(step).toEqual(cols);
    }
  });

  it("renameColumns: next step sees renamed columns", () => {
    const transforms: Transform[] = [
      { type: "renameColumns", mapping: { salary: "pay" } },
      { type: "filter", column: "pay", operator: ">", value: 0 },
    ];
    const result = computeColumnsPerStep(cols, transforms, sample);
    expect(result[0]).toEqual(cols); // step 0: original
    expect(result[1]).toContain("pay"); // step 1: after rename
    expect(result[1]).not.toContain("salary");
    expect(result[2]).toContain("pay"); // step 2: still renamed
  });

  it("groupBy: next step sees group column + aggregation columns", () => {
    const transforms: Transform[] = [
      {
        type: "groupBy",
        column: "department",
        aggregations: [
          { column: "salary", fn: "sum" },
          { column: "salary", fn: "count" },
        ],
      },
      { type: "sort", column: "salary_sum", direction: "desc" },
    ];
    const result = computeColumnsPerStep(cols, transforms, sample);
    expect(result[0]).toEqual(cols); // step 0: original
    expect(result[1]).toContain("department"); // step 1: group key
    expect(result[1]).toContain("salary_sum"); // step 1: agg column
    expect(result[1]).toContain("salary_count"); // step 1: agg column
    expect(result[1]).not.toContain("name"); // original col removed
  });

  it("calculatedColumn: next step sees new column", () => {
    const transforms: Transform[] = [
      { type: "calculatedColumn", name: "bonus", expression: "salary * 0.1" },
      { type: "filter", column: "bonus", operator: ">", value: 10000 },
    ];
    const result = computeColumnsPerStep(cols, transforms, sample);
    expect(result[0]).toEqual(cols);
    expect(result[1]).toContain("bonus"); // new column visible
    expect(result[1]).toContain("salary"); // original still there
  });

  it("chained: rename → calc → groupBy — each step sees correct columns", () => {
    const transforms: Transform[] = [
      { type: "renameColumns", mapping: { salary: "pay" } },
      { type: "calculatedColumn", name: "bonus", expression: "pay * 0.1" },
      {
        type: "groupBy",
        column: "department",
        aggregations: [{ column: "bonus", fn: "sum" }],
      },
    ];
    const result = computeColumnsPerStep(cols, transforms, sample);
    expect(result[0]).toEqual(cols); // original
    expect(result[1]).toContain("pay"); // after rename
    expect(result[2]).toContain("bonus"); // after calc
    expect(result[3]).toContain("department"); // after groupBy
    expect(result[3]).toContain("bonus_sum"); // agg column
  });
});
