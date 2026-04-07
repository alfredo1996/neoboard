/**
 * Sankey chart data transform.
 */

import { toRecords, normalizeValue } from "./shared";

/**
 * Transform to Sankey chart format: { nodes: [{ name }], links: [{ source, target, value }] }
 * Expects records with source, target, and value columns.
 */
export function transformToSankeyData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return { nodes: [], links: [] };
  const keys = Object.keys(records[0]);
  if (keys.length < 2) return { nodes: [], links: [] };

  // Resolve source/target/value columns heuristically
  const sourceKey = keys.find((k) => /source|from|start/i.test(k)) ?? keys[0];
  const targetKey =
    keys.find((k) => /target|to|end/i.test(k) && k !== sourceKey) ?? keys[1];
  const valueKey =
    keys.find(
      (k) =>
        /value|count|weight|amount/i.test(k) &&
        k !== sourceKey &&
        k !== targetKey,
    ) ?? keys[2];

  const nodeNames = new Set<string>();
  const links: Array<{ source: string; target: string; value: number }> = [];

  for (const r of records) {
    const src = String(normalizeValue(r[sourceKey]) ?? "");
    const tgt = String(normalizeValue(r[targetKey]) ?? "");
    const val = valueKey ? Number(r[valueKey]) || 0 : 1;
    if (src) nodeNames.add(src);
    if (tgt) nodeNames.add(tgt);
    links.push({ source: src, target: tgt, value: val });
  }

  return {
    nodes: Array.from(nodeNames).map((name) => ({ name })),
    links,
  };
}
