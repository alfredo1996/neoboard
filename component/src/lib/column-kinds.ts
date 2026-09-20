import { sortingFns, type SortingFn } from "@tanstack/react-table";
import { compareNumericCells, isNumericCell } from "./numeric-cell";

/**
 * What kind of values a column holds, judged from the WHOLE column (#1662).
 *
 * TanStack's `sortingFn: "auto"` judges from `flatRows.slice(10)` — every
 * row after the tenth, not the first ten as #1662 first assumed. A table of
 * ten rows or fewer, or a column whose values past row ten are all null,
 * therefore samples nothing and falls through to `basic`, which compares
 * strings by code unit: "Zebra" sorts before "apple", and "10" < "100" < "9"
 * for numeric strings. Which comparator a column gets must not depend on
 * which rows a sample happens to hit.
 */
export type ColumnKind = "numeric" | "datetime" | "text" | "empty";

/**
 * A calendar day, or a point in time, as ISO-8601 (#1904). Matched by pattern
 * rather than by `new Date()`, which accepts a bare year, "Sat", and plenty
 * else that is not a temporal column.
 *
 * An ISO-8601 *duration* (`P1M2DT3S`) deliberately does not match: it is a
 * length, not a point, nothing in the app reads one, and as text it renders
 * and sorts as what it is (#1925).
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Split in two rather than written as one pattern: a single regex covering
 * both halves scores 39 on Sonar's complexity budget of 20, and the two-step
 * form says what it checks.
 */
function isIsoTemporal(v: string): boolean {
  if (ISO_DATE.test(v)) return true;
  const separator = v[10];
  if (separator !== "T" && separator !== " ") return false;
  return ISO_DATE.test(v.slice(0, 10)) && ISO_TIME.test(v.slice(11));
}

export function inferColumnKind(values: readonly unknown[]): ColumnKind {
  let seen = 0;
  let numbers = 0;
  let temporals = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    seen++;
    // Numeric first: a decimal string is a number whose precision a double
    // could not hold (#1304, #1307), not text that happens to contain digits.
    if (isNumericCell(v)) numbers++;
    else if (typeof v === "string" && isIsoTemporal(v)) temporals++;
  }
  if (seen === 0) return "empty";
  if (numbers === seen) return "numeric";
  if (temporals === seen) return "datetime";
  return "text";
}

/**
 * The comparator for a kind.
 *
 * Numeric compares digits rather than doubles (#1925): `basic` subtracts its
 * operands, so two ids past 2^53 come out equal and the column mis-sorts with
 * nothing to show for it. Text — a genuinely mixed column — gets
 * `alphanumeric`: it lowercases and compares digit runs as numbers, so "9" <
 * "10" and "apple" < "Zebra". An empty column has nothing to compare; `basic`
 * is as good as any.
 */
export function sortingFnForKind<TData>(kind: ColumnKind): SortingFn<TData> {
  switch (kind) {
    case "numeric":
      return (a, b, columnId) =>
        compareNumericCells(a.getValue(columnId), b.getValue(columnId));
    case "datetime":
      return sortingFns.datetime;
    case "text":
      return sortingFns.alphanumeric;
    case "empty":
      return sortingFns.basic;
  }
}

/**
 * First-click direction, the same convention TanStack's `getAutoSortDir`
 * applies from row zero — numbers and dates descend first, text ascends —
 * decided from the whole column so it cannot flip on a null first cell.
 */
export function sortDescFirstForKind(kind: ColumnKind): boolean {
  return kind === "numeric" || kind === "datetime";
}
