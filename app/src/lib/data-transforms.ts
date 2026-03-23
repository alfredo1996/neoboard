// ---------------------------------------------------------------------------
// Client-side data transform pipeline
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export interface FilterTransform {
  type: "filter";
  column: string;
  operator: ">" | ">=" | "<" | "<=" | "==" | "!=" | "contains" | "not_contains";
  value: string | number;
}

export interface SortTransform {
  type: "sort";
  column: string;
  direction: "asc" | "desc";
}

export interface Aggregation {
  column: string;
  fn: "count" | "sum" | "avg" | "min" | "max";
}

export interface GroupByTransform {
  type: "groupBy";
  column: string;
  aggregations: Aggregation[];
}

export interface CalculatedColumnTransform {
  type: "calculatedColumn";
  name: string;
  /** Simple arithmetic expression referencing column names (e.g. "salary * 0.1") */
  expression: string;
}

export interface RenameColumnsTransform {
  type: "renameColumns";
  mapping: Record<string, string>;
}

export interface LimitTransform {
  type: "limit";
  count: number;
}

export type Transform =
  | FilterTransform
  | SortTransform
  | GroupByTransform
  | CalculatedColumnTransform
  | RenameColumnsTransform
  | LimitTransform;

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

function matchesFilter(value: unknown, operator: FilterTransform["operator"], compare: string | number): boolean {
  // Numeric comparison
  const numLeft = Number(value);
  const numRight = Number(compare);

  if (!Number.isNaN(numLeft) && !Number.isNaN(numRight)) {
    switch (operator) {
      case ">":  return numLeft > numRight;
      case ">=": return numLeft >= numRight;
      case "<":  return numLeft < numRight;
      case "<=": return numLeft <= numRight;
      case "==": return numLeft === numRight;
      case "!=": return numLeft !== numRight;
    }
  }

  // String comparison
  const strLeft = String(value ?? "").toLowerCase();
  const strRight = String(compare).toLowerCase();

  switch (operator) {
    case "==": return strLeft === strRight;
    case "!=": return strLeft !== strRight;
    case "contains": return strLeft.includes(strRight);
    case "not_contains": return !strLeft.includes(strRight);
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// Individual transform functions
// ---------------------------------------------------------------------------

function applyFilter(data: Row[], t: FilterTransform): Row[] {
  return data.filter((row) => matchesFilter(row[t.column], t.operator, t.value));
}

function applySort(data: Row[], t: SortTransform): Row[] {
  const sorted = [...data];
  sorted.sort((a, b) => {
    const va = a[t.column];
    const vb = b[t.column];

    // Numeric sort
    const na = Number(va);
    const nb = Number(vb);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      return t.direction === "asc" ? na - nb : nb - na;
    }

    // String sort
    const sa = String(va ?? "");
    const sb = String(vb ?? "");
    const cmp = sa.localeCompare(sb);
    return t.direction === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function applyGroupBy(data: Row[], t: GroupByTransform): Row[] {
  const groups = new Map<unknown, Row[]>();
  for (const row of data) {
    const key = row[t.column];
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const result: Row[] = [];
  for (const [key, rows] of groups) {
    const aggregated: Row = { [t.column]: key };
    for (const agg of t.aggregations) {
      const values = rows.map((r) => r[agg.column]).filter((v) => v != null);
      const nums = values.map(Number).filter((n) => !Number.isNaN(n));
      const outKey = `${agg.column}_${agg.fn}`;

      switch (agg.fn) {
        case "count":
          aggregated[outKey] = rows.length;
          break;
        case "sum":
          aggregated[outKey] = nums.reduce((a, b) => a + b, 0);
          break;
        case "avg":
          aggregated[outKey] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
          break;
        case "min":
          aggregated[outKey] = nums.length ? Math.min(...nums) : null;
          break;
        case "max":
          aggregated[outKey] = nums.length ? Math.max(...nums) : null;
          break;
      }
    }
    result.push(aggregated);
  }
  return result;
}

function applyCalculatedColumn(data: Row[], t: CalculatedColumnTransform): Row[] {
  return data.map((row) => {
    let result: unknown;
    try {
      // Simple expression evaluator: replace column references with values
      // Supports: column +|-|*|/ number, column +|-|*|/ column
      const expr = t.expression.replace(/[a-zA-Z_]\w*/g, (match) => {
        if (match in row) {
          const val = row[match];
          return typeof val === "number" ? String(val) : `"${String(val ?? "")}"`;
        }
        return match;
      });
      // Safe evaluation: only allow numbers, basic arithmetic, and strings
      result = new Function(`"use strict"; return (${expr});`)();
    } catch {
      result = null;
    }
    return { ...row, [t.name]: result };
  });
}

function applyRenameColumns(data: Row[], t: RenameColumnsTransform): Row[] {
  return data.map((row) => {
    const newRow: Row = {};
    for (const [key, value] of Object.entries(row)) {
      const newKey = t.mapping[key] ?? key;
      newRow[newKey] = value;
    }
    return newRow;
  });
}

function applyLimit(data: Row[], t: LimitTransform): Row[] {
  return data.slice(0, t.count);
}

// ---------------------------------------------------------------------------
// Pipeline executor
// ---------------------------------------------------------------------------

/**
 * Apply an ordered array of transforms to tabular data.
 * Each transform operates on the output of the previous one.
 * The original data is never mutated.
 */
export function applyTransforms(
  data: Row[],
  transforms: Transform[],
): Row[] {
  let result = data;
  for (const t of transforms) {
    switch (t.type) {
      case "filter":
        result = applyFilter(result, t);
        break;
      case "sort":
        result = applySort(result, t);
        break;
      case "groupBy":
        result = applyGroupBy(result, t);
        break;
      case "calculatedColumn":
        result = applyCalculatedColumn(result, t);
        break;
      case "renameColumns":
        result = applyRenameColumns(result, t);
        break;
      case "limit":
        result = applyLimit(result, t);
        break;
    }
  }
  return result;
}
