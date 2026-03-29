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
  // Null/undefined/empty never match numeric comparisons — guard against
  // Number(null)===0 and Number("")===0 producing false positives.
  if (value === null || value === undefined || value === "") {
    // String operators still work on empty strings
    if (operator === "==" || operator === "!=") {
      const strLeft = String(value ?? "").toLowerCase();
      const strRight = String(compare).toLowerCase();
      return operator === "==" ? strLeft === strRight : strLeft !== strRight;
    }
    return false;
  }

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
 * Check if a transform has enough configuration to execute.
 * Incomplete transforms (e.g. newly added filter with empty value) are skipped.
 */
function isTransformReady(t: Transform): boolean {
  switch (t.type) {
    case "filter":
      return !!t.column && (t.value !== "" || !!t.paramRef);
    case "sort":
      return !!t.column;
    case "groupBy":
      return !!t.column && t.aggregations.length > 0;
    case "calculatedColumn":
      return !!t.name && !!t.expression;
    case "renameColumns":
      return Object.keys(t.mapping).length > 0;
    case "limit":
      return t.count > 0;
    default:
      return true;
  }
}

/**
 * Apply an ordered array of transforms to tabular data.
 * Each transform operates on the output of the previous one.
 * The original data is never mutated. Incomplete transforms are skipped.
 */
export function applyTransforms(
  data: Row[],
  transforms: Transform[],
  paramValues?: Record<string, unknown>,
): Row[] {
  if (!Array.isArray(data) || !Array.isArray(transforms)) return data;
  let result = data;
  for (const t of transforms) {
    if (!t || typeof t !== "object" || !t.type) continue;
    // Skip incomplete transforms (e.g. newly added filter with empty value)
    if (!isTransformReady(t)) continue;
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

/**
 * Compute the column names available at each step in a transform pipeline.
 *
 * result[0] = original columns (what step 0 sees)
 * result[i] = columns after applying transforms[0..i-1] (what step i sees)
 *
 * Uses a lightweight simulation with a single sample row.
 */
export function computeColumnsPerStep(
  originalColumns: string[],
  transforms: Transform[],
  sampleRow?: Record<string, unknown>,
): string[][] {
  const fakeRow: Row = { ...(sampleRow ?? {}) };
  for (const col of originalColumns) {
    if (!(col in fakeRow)) fakeRow[col] = "";
  }

  const result: string[][] = [originalColumns];
  let currentData: Row[] = [fakeRow];

  for (let i = 0; i < transforms.length; i++) {
    try {
      currentData = applyTransforms(currentData, [transforms[i]]);
    } catch {
      // Transform failed on fake data — keep previous columns
    }
    const cols =
      currentData.length > 0
        ? Object.keys(currentData[0])
        : result[result.length - 1];
    result.push(cols);
  }

  return result;
}
