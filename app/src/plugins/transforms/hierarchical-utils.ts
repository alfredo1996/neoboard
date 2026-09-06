/**
 * Hierarchical data transform shared by the Sunburst, Treemap and Circle
 * Packing charts.
 */

import { toRecords, normalizeValue } from "./shared-utils";

type HierNode = {
  name: string;
  value?: number;
  children?: HierNode[];
  [key: string]: unknown;
};

/** Separator that cannot occur in a column value, so parent+name is unique. */
const KEY_SEP = "\u0000";

const NAME_RE = /^(name|label|title|category)$/i;
const VALUE_RE = /^(value|count|size)$/i;
const PARENT_RE = /^parent$/i;

/** A value must have area to be drawable: NaN, Infinity and <= 0 do not. */
function drawableValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface Resolved {
  nameKey: string;
  parentKey?: string;
  valueKey?: string;
  keys: string[];
}

/**
 * Which column means what. The value column is matched by name first, then by
 * finding a column whose first non-null value reads as a number — node-pg
 * returns NUMERIC as a string, so a string that parses counts.
 */
function resolveColumns(records: Record<string, unknown>[]): Resolved {
  const keys = Object.keys(records[0]);
  const parentKey = keys.find((k) => PARENT_RE.test(k));
  const nameKey =
    keys.find((k) => NAME_RE.test(k) && k !== parentKey) ??
    keys.find((k) => k !== parentKey) ??
    keys[0];
  const valueKey =
    keys.find((k) => VALUE_RE.test(k) && k !== nameKey && k !== parentKey) ??
    keys.find((k) => {
      if (k === nameKey || k === parentKey) return false;
      const sample = records.find((r) => r[k] !== null && r[k] !== undefined);
      return sample !== undefined && drawableValue(sample[k]) !== null;
    });
  return { nameKey, parentKey, valueKey, keys };
}

/**
 * Link flat rows into trees. Returns the roots, plus how many nodes no root
 * can reach — which is how a cycle shows up.
 */
function buildTree(
  records: Record<string, unknown>[],
  { nameKey, parentKey, valueKey }: Resolved,
): { roots: HierNode[]; unreachable: number } {
  const nodes = new Map<string, HierNode>();
  const parentOf = new Map<string, string>();
  /** Node name -> the key of the row that defines it. */
  const keyByName = new Map<string, string>();

  for (const r of records) {
    const name = String(normalizeValue(r[nameKey]) ?? "");
    const parent = parentKey ? String(normalizeValue(r[parentKey]) ?? "") : "";
    const value = valueKey ? drawableValue(r[valueKey]) : null;
    // A row whose value cannot be drawn is not a node. Its parent may still be
    // named by another row, so the rest of the tree is unaffected.
    if (valueKey && value === null) continue;

    const key = `${parent}${KEY_SEP}${name}`;
    const existing = nodes.get(key);
    if (existing) {
      // Same parent and same name: one node, values summed.
      existing.value = (existing.value ?? 0) + (value ?? 0);
      continue;
    }
    // Every query column rides along so styling rules and click actions can
    // resolve against them; the detected fields are assigned last and win.
    const node: HierNode = { ...r, name, ...(value === null ? {} : { value }) };
    nodes.set(key, node);
    parentOf.set(key, parent);
    keyByName.set(name, key);
  }

  // A parent named by a row but never returned as a row of its own is
  // synthesised. That is the shape our own documented queries produce, and
  // dropping it flattened the entire chart.
  for (const parent of [...new Set(parentOf.values())]) {
    if (!parent || keyByName.has(parent)) continue;
    const key = `${KEY_SEP}${parent}`;
    nodes.set(key, { name: parent });
    parentOf.set(key, "");
    keyByName.set(parent, key);
  }

  const roots: HierNode[] = [];
  for (const [key, node] of nodes) {
    const parent = parentOf.get(key) ?? "";
    const parentKeyOfNode = parent ? keyByName.get(parent) : undefined;
    if (!parent || parentKeyOfNode === undefined || parentKeyOfNode === key) {
      roots.push(node);
      continue;
    }
    const parentNode = nodes.get(parentKeyOfNode);
    if (!parentNode) {
      roots.push(node);
      continue;
    }
    (parentNode.children ??= []).push(node);
  }

  // Reachability from the roots: a cycle leaves its members linked to each
  // other but connected to nothing.
  const seen = new Set<HierNode>();
  const walk = (n: HierNode) => {
    if (seen.has(n)) return;
    seen.add(n);
    n.children?.forEach(walk);
  };
  roots.forEach(walk);

  // An explicit parent value below its children's total would clip the
  // subtree, so it is dropped and the chart sums instead.
  const settle = (n: HierNode): number => {
    if (!n.children?.length) return n.value ?? 0;
    const sum = n.children.reduce((total, c) => total + settle(c), 0);
    if (n.value !== undefined && n.value < sum) delete n.value;
    return n.value ?? sum;
  };
  roots.forEach(settle);

  return { roots, unreachable: nodes.size - seen.size };
}

/**
 * Transform to Sunburst/Treemap/Circle-Packing hierarchical format.
 * 1. Data already has `children` — pass through.
 * 2. Flat data with a `parent` column — build the hierarchy.
 * 3. Flat name/value pairs — return them flat.
 */
export function transformToHierarchicalData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  if ("children" in records[0]) return records;

  const resolved = resolveColumns(records);
  if (resolved.parentKey) return buildTree(records, resolved).roots;

  const { nameKey, valueKey } = resolved;
  return records
    .map((r) => {
      const value = valueKey ? drawableValue(r[valueKey]) : null;
      if (value === null) return null;
      return { ...r, name: String(normalizeValue(r[nameKey]) ?? ""), value };
    })
    .filter(Boolean);
}

/**
 * Explain, before anything is drawn, why a result cannot become a hierarchy.
 * Returns null when it can.
 *
 * This runs ahead of the transform, which never throws: the widget host
 * catches a throwing transform and then feeds the RAW rows to the chart, which
 * is worse than saying what is wrong.
 */
export function validateHierarchicalData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  if ("children" in records[0]) return null;

  const resolved = resolveColumns(records);
  if (!resolved.valueKey) {
    return `Sunburst, treemap and circle packing need a numeric value column. Found: ${resolved.keys.join(", ")}`;
  }

  const valueKey = resolved.valueKey;
  const usable = records.filter((r) => drawableValue(r[valueKey]) !== null);
  if (usable.length === 0) {
    return `No row has a usable value in "${valueKey}". Values must be positive numbers.`;
  }

  if (resolved.parentKey && buildTree(records, resolved).unreachable > 0) {
    return "The parent column forms a cycle, so some rows have no path to a root. Check the parent column.";
  }
  return null;
}
