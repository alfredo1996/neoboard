import { toRecords, normalizeValue } from "../transforms/shared-utils";

/**
 * Transform raw query results into Gantt chart data.
 *
 * Heuristically detects columns:
 * - task/name/label → task name (required)
 * - start/start_date/begin → start time (required)
 * - end/end_date/finish/due → end time (required)
 * - category/status/group/phase → color grouping (optional)
 * - progress/percent/completion → 0-1 completion (optional)
 */
export function transformToGanttData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];

  const keys = Object.keys(records[0]);
  if (keys.length < 3) return [];

  // Detect task column
  const taskKey =
    keys.find((k) => /^(task|name|label|title)$/i.test(k)) ?? keys[0];

  // Detect start column
  const startKey =
    keys.find(
      (k) => k !== taskKey && /^(start|start_date|begin|from)$/i.test(k),
    ) ?? keys[1];

  // Detect end column
  const endKey =
    keys.find(
      (k) =>
        k !== taskKey &&
        k !== startKey &&
        /^(end|end_date|finish|due|to|deadline)$/i.test(k),
    ) ?? keys[2];

  // Detect optional category column
  const categoryKey = keys.find(
    (k) =>
      k !== taskKey &&
      k !== startKey &&
      k !== endKey &&
      /^(category|status|group|phase|type)$/i.test(k),
  );

  // Detect optional progress column
  const progressKey = keys.find(
    (k) =>
      k !== taskKey &&
      k !== startKey &&
      k !== endKey &&
      k !== categoryKey &&
      /^(progress|percent|completion|pct)$/i.test(k),
  );

  return records
    .map((row) => {
      const task = String(normalizeValue(row[taskKey]) ?? "");
      const startRaw = row[startKey];
      const endRaw = row[endKey];

      // Parse dates — accept ISO strings, Unix timestamps (ms or s), Date objects
      const start = parseTime(startRaw);
      const end = parseTime(endRaw);

      if (start === null || end === null) return null;

      // The raw row rides along so a click action can name any query column
      // the editor offered (#1589). Detected fields are assigned after it and
      // still win; the chart reads only its own typed fields.
      const item: Record<string, unknown> = {
        properties: row,
        task,
        start,
        end,
      };

      if (categoryKey && row[categoryKey] != null) {
        item.category = String(normalizeValue(row[categoryKey]) ?? "");
      }

      if (progressKey && row[progressKey] != null) {
        const p = Number(row[progressKey]);
        if (!Number.isNaN(p)) {
          // Accept 0-1 or 0-100 range, then clamp to [0, 1]
          const scaled = p > 1 ? p / 100 : p;
          item.progress = Math.max(0, Math.min(1, scaled));
        }
      }

      return item;
    })
    .filter(Boolean);
}

function parseTime(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") {
    // Heuristic: values below 1e12 (~Sep 2001 in ms) are treated as seconds.
    // This correctly handles Unix timestamps (seconds since epoch) but will
    // misclassify pre-2001 millisecond timestamps. In practice, Gantt data
    // is almost always recent dates, so this is an acceptable trade-off.
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
    // Try as numeric string
    const num = Number(value);
    if (!Number.isNaN(num)) return num < 1e12 ? num * 1000 : num;
  }
  return null;
}
