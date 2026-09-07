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

interface GanttKeys {
  taskKey: string;
  startKey: string;
  endKey: string;
  categoryKey?: string;
  progressKey?: string;
}

/** Which column means what. Shared by the transform and by validate. */
function resolveKeys(keys: string[]): GanttKeys {
  const taskKey =
    keys.find((k) => /^(task|name|label|title)$/i.test(k)) ?? keys[0];

  const startKey =
    keys.find(
      (k) => k !== taskKey && /^(start|start_date|begin|from)$/i.test(k),
    ) ?? keys[1];

  const endKey =
    keys.find(
      (k) =>
        k !== taskKey &&
        k !== startKey &&
        /^(end|end_date|finish|due|to|deadline)$/i.test(k),
    ) ?? keys[2];

  const categoryKey = keys.find(
    (k) =>
      k !== taskKey &&
      k !== startKey &&
      k !== endKey &&
      /^(category|status|group|phase|type)$/i.test(k),
  );

  const progressKey = keys.find(
    (k) =>
      k !== taskKey &&
      k !== startKey &&
      k !== endKey &&
      k !== categoryKey &&
      /^(progress|percent|completion|pct)$/i.test(k),
  );

  return { taskKey, startKey, endKey, categoryKey, progressKey };
}

export function transformToGanttData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];

  const keys = Object.keys(records[0]);
  if (keys.length < 3) return [];

  const { taskKey, startKey, endKey, categoryKey, progressKey } =
    resolveKeys(keys);

  return records
    .map((row) => {
      const task = String(normalizeValue(row[taskKey]) ?? "");

      // Accept ISO strings, Unix timestamps (ms or s) and Date objects.
      const start = parseTime(row[startKey]);
      const end = parseTime(row[endKey]);

      if (!isDrawableSpan(start, end)) return null;

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

/** A date-only ISO string — the shape a Neo4j `date` property arrives as. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A bare number, so "1999" takes the number rule and not Date.parse. */
const NUMERIC = /^[+-]?\d+(\.\d+)?$/;

/**
 * Seconds since the epoch only became plausible in 2001 (1e9 ≈ 2001-09-09).
 * Below that a number is a year, a day-of-month or a count — not a date.
 */
const MIN_EPOCH_SECONDS = 1e9;
/** At or above this a number is already milliseconds (1e12 ≈ 2001-09-09). */
const MIN_EPOCH_MS = 1e12;

function parseNumericTime(n: number): number | null {
  if (!Number.isFinite(n) || n < MIN_EPOCH_SECONDS) return null;
  return n < MIN_EPOCH_MS ? n * 1000 : n;
}

/**
 * A bar that ends before it starts has negative width. Equal start and end is
 * a milestone and draws. Shared with validate so the two cannot disagree about
 * which rows reach the chart.
 */
function isDrawableSpan(start: number | null, end: number | null): boolean {
  return start !== null && end !== null && end >= start;
}

function parseTime(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "number") return parseNumericTime(value);
  if (typeof value === "string") {
    // ECMA-262 parses a date-only string as UTC midnight, which lands a day
    // early for every user west of UTC once it is drawn on a local-time axis
    // (#1616). Neo4j hands `date` properties over in exactly this shape.
    const dateOnly = DATE_ONLY.exec(value);
    if (dateOnly) {
      const [, y, m, d] = dateOnly;
      // Out-of-range parts roll over (2026-13-01 → Jan 2027) rather than
      // producing an invalid Date, so there is nothing to guard here.
      return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
    }
    // Checked before Date.parse, which accepts a bare "1999" as the year 1999
    // and would let a year column through as a date.
    if (NUMERIC.test(value)) return parseNumericTime(Number(value));

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * Explain why a result cannot become a gantt, before anything is drawn.
 * Returns null when it can.
 *
 * Without this a wrong-shaped result reaches the empty state and says "No
 * data" — indistinguishable from a query that genuinely returned nothing.
 */
export function validateGanttData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;

  const keys = Object.keys(records[0]);
  if (keys.length < 3) {
    return `Gantt needs task, start and end columns (optional: category, progress) — got: ${keys.join(", ")}`;
  }

  const { startKey, endKey } = resolveKeys(keys);
  const spans = records.map(
    (r) => [parseTime(r[startKey]), parseTime(r[endKey])] as const,
  );
  if (spans.some(([start, end]) => isDrawableSpan(start, end))) return null;

  // Both dates read but every bar runs backwards: the columns are almost
  // certainly the right kind and the wrong way round, which is a different
  // thing to tell the user than "these are not dates".
  if (spans.some(([start, end]) => start !== null && end !== null)) {
    return `Every row ends before it starts. Check that "${startKey}" and "${endKey}" are not swapped.`;
  }
  return `No row has a parseable start and end date in "${startKey}" and "${endKey}". Dates must be YYYY-MM-DD, ISO datetimes, Date values or Unix timestamps — a year column such as released is a number, not a date.`;
}
