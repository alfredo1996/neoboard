/**
 * Hierarchical data transform shared by Sunburst and Treemap charts.
 */

import { toRecords, normalizeValue } from "./shared";

/**
 * Transform to Sunburst/Treemap hierarchical format.
 * Handles three cases:
 * 1. Data already has `children` array — pass through.
 * 2. Flat data with `parent` column — build hierarchy.
 * 3. Flat data with name/value only — return flat array.
 */
export function transformToHierarchicalData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];

  const first = records[0];
  const keys = Object.keys(first);

  // Case 1: pre-hierarchical (has children key on first record)
  if ("children" in first) {
    return records;
  }

  // Case 2: flat with parent column — build hierarchy
  const hasParent = keys.includes("parent");
  if (hasParent) {
    const nameKey =
      keys.find((k) => /^(name|label|title)$/i.test(k)) ?? keys[0];
    const valueKey =
      keys.find((k) => /^(value|count|size)$/i.test(k) && k !== nameKey) ??
      keys.find((k) => k !== nameKey && k !== "parent");

    type HierNode = { name: string; value: number; children?: HierNode[] };
    const nodeMap = new Map<string, HierNode>();

    // Build node map
    for (const r of records) {
      const name = String(normalizeValue(r[nameKey]) ?? "");
      const value = valueKey ? Number(r[valueKey]) || 0 : 0;
      nodeMap.set(name, { name, value });
    }

    const roots: HierNode[] = [];

    // Link children to parents
    for (const r of records) {
      const name = String(normalizeValue(r[nameKey]) ?? "");
      const parent = String(r.parent ?? "");
      const node = nodeMap.get(name);
      if (!node) continue;

      if (!parent || !nodeMap.has(parent)) {
        roots.push(node);
      } else {
        const parentNode = nodeMap.get(parent)!;
        if (!parentNode.children) parentNode.children = [];
        parentNode.children.push(node);
      }
    }

    return roots;
  }

  // Case 3: flat name/value pairs
  const nameKey =
    keys.find((k) => /^(name|label|title|category)$/i.test(k)) ?? keys[0];
  const valueKey = keys.find((k) => k !== nameKey) ?? keys[1];

  return records.map((r) => ({
    name: String(normalizeValue(r[nameKey]) ?? ""),
    value: valueKey ? Number(r[valueKey]) || 0 : 0,
  }));
}
