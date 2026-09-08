import { sortingFns, type SortingFn } from "@tanstack/react-table";

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

export function inferColumnKind(values: readonly unknown[]): ColumnKind {
  let seen = 0;
  let numbers = 0;
  let dates = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    seen++;
    if (typeof v === "number") numbers++;
    else if (v instanceof Date) dates++;
  }
  if (seen === 0) return "empty";
  if (numbers === seen) return "numeric";
  if (dates === seen) return "datetime";
  return "text";
}

/**
 * The comparator for a kind. Text — including numeric strings and mixed
 * columns — gets `alphanumeric`: it lowercases, and compares digit runs as
 * numbers, so "9" < "10" and "apple" < "Zebra". An empty column has nothing
 * to compare; `basic` is as good as any.
 */
export function sortingFnForKind<TData>(kind: ColumnKind): SortingFn<TData> {
  switch (kind) {
    case "numeric":
      return sortingFns.basic;
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
