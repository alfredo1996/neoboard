// ---------------------------------------------------------------------------
// Client-side data transform pipeline
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export type FilterOperator =
  | ">"
  | ">="
  | "<"
  | "<="
  | "=="
  | "!="
  | "contains"
  | "not_contains";

export interface FilterTransform {
  type: "filter";
  column: string;
  operator: FilterOperator;
  value: string | number;
  /** When set, the comparison value is resolved from paramValues[$param_xxx] at runtime */
  paramRef?: string;
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

function matchesFilter(
  value: unknown,
  operator: FilterTransform["operator"],
  compare: string | number,
): boolean {
  // Numeric comparison
  const numLeft = Number(value);
  const numRight = Number(compare);

  if (!Number.isNaN(numLeft) && !Number.isNaN(numRight)) {
    switch (operator) {
      case ">":
        return numLeft > numRight;
      case ">=":
        return numLeft >= numRight;
      case "<":
        return numLeft < numRight;
      case "<=":
        return numLeft <= numRight;
      case "==":
        return numLeft === numRight;
      case "!=":
        return numLeft !== numRight;
    }
  }

  // String comparison
  const strLeft = String(value ?? "").toLowerCase();
  const strRight = String(compare).toLowerCase();

  switch (operator) {
    case "==":
      return strLeft === strRight;
    case "!=":
      return strLeft !== strRight;
    case "contains":
      return strLeft.includes(strRight);
    case "not_contains":
      return !strLeft.includes(strRight);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Individual transform functions
// ---------------------------------------------------------------------------

function resolveFilterValue(
  t: FilterTransform,
  paramValues?: Record<string, unknown>,
): string | number {
  if (t.paramRef && paramValues) {
    const resolved = paramValues[t.paramRef];
    if (resolved !== undefined && resolved !== null) return String(resolved);
  }
  return t.value;
}

function applyFilter(
  data: Row[],
  t: FilterTransform,
  paramValues?: Record<string, unknown>,
): Row[] {
  const compareValue = resolveFilterValue(t, paramValues);
  return data.filter((row) =>
    matchesFilter(row[t.column], t.operator, compareValue),
  );
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
          aggregated[outKey] = nums.length
            ? nums.reduce((a, b) => a + b, 0) / nums.length
            : 0;
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

/**
 * Safely evaluate a simple arithmetic expression without `new Function()`.
 * Supports: +, -, *, / with numeric operands (column values or literals).
 * Returns null if the expression cannot be evaluated.
 */
function safeEvaluateExpression(
  expression: string,
  row: Row,
  paramValues?: Record<string, unknown>,
): unknown {
  // Tokenize: split on operators while keeping them
  const tokens: string[] = [];
  let current = "";
  for (const ch of expression) {
    if ("+-*/".includes(ch) && current.trim()) {
      tokens.push(current.trim());
      tokens.push(ch);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  if (tokens.length === 0) return null;

  function resolveToken(token: string): number | null {
    // Parameter reference ($param_xxx)
    if (token.startsWith("$param_") && paramValues) {
      const paramName = token.slice(7); // strip "$param_"
      const val = Number(paramValues[paramName]);
      return Number.isNaN(val) ? null : val;
    }
    // Column reference
    if (token in row) {
      const val = Number(row[token]);
      return Number.isNaN(val) ? null : val;
    }
    // Numeric literal
    const num = Number(token);
    return Number.isNaN(num) ? null : num;
  }

  // Evaluate left-to-right (no operator precedence for simplicity)
  let result = resolveToken(tokens[0]);
  if (result === null) return null;

  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const right = resolveToken(tokens[i + 1]);
    if (right === null) return null;

    switch (op) {
      case "+":
        result += right;
        break;
      case "-":
        result -= right;
        break;
      case "*":
        result *= right;
        break;
      case "/":
        result = right !== 0 ? result / right : null;
        break;
      default:
        return null;
    }
    if (result === null) return null;
  }

  return result;
}

function applyCalculatedColumn(
  data: Row[],
  t: CalculatedColumnTransform,
  paramValues?: Record<string, unknown>,
): Row[] {
  return data.map((row) => {
    const result = safeEvaluateExpression(t.expression, row, paramValues);
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
  paramValues?: Record<string, unknown>,
): Row[] {
  let result = data;
  for (const t of transforms) {
    switch (t.type) {
      case "filter":
        result = applyFilter(result, t, paramValues);
        break;
      case "sort":
        result = applySort(result, t);
        break;
      case "groupBy":
        result = applyGroupBy(result, t);
        break;
      case "calculatedColumn":
        result = applyCalculatedColumn(result, t, paramValues);
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
