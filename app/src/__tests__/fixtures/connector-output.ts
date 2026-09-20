/**
 * Connector-shaped fixtures (#1636).
 *
 * What a real result set looks like, as the connectors actually emit it — the
 * shapes no chart or transform fixture reflected before this file existed.
 * Since #1904 those shapes are the SDK's row value contract, the same from
 * every connector:
 *
 * - A graph node arrives as a plain, tagged
 *   `{ $type: "node", identity, elementId, labels, properties }` object, never
 *   a driver instance. The keys are what they always were; the tag is new.
 * - A date arrives as a `'YYYY-MM-DD'` string (#1651, #1654). Assuming a Date
 *   at UTC midnight is how #1616 shipped.
 * - A date-time arrives as an ISO-8601 string, never a JS `Date`: a row crosses
 *   JSON before it reaches any of this code, so a `Date` was never reachable.
 * - A duration or interval arrives as an ISO-8601 duration (`P1M2DT3S`).
 * - A number stored as a string arrives as a string (`"48210.50"`): a text
 *   column, or a decimal a double cannot hold (#1307). The transform layer may
 *   not assume every number is a number — #1622 shipped from string
 *   coordinates.
 * - A missing cell is `null`, and a "blank" cell can be whitespace.
 *
 * Tests that want realistic input draw from here instead of hand-writing tidy
 * `{ a: 1, b: 2 }` rows. The whole contract of the transform layer is turning
 * this into chart input; a fixture that skips the mess tests nothing.
 *
 * component/src/charts/__tests__/fixtures/connector-output.ts is a deliberate
 * copy: component/ may not import app/, and hosting this in the SDK would add
 * a runtime dependency that package does not have. Keep the two in step.
 */

export interface GraphNodeFixture {
  $type: "node";
  identity: number;
  elementId: string;
  labels: string[];
  properties: Record<string, unknown>;
}

/** A Customer node exactly as a graph connector's parser hands it over. */
export const graphNode: GraphNodeFixture = {
  $type: "node",
  identity: 42,
  elementId: "4:9e2c1f0a-6d3b-4c8e-b1a7-2f5d8c9e0b11:42",
  labels: ["Customer"],
  properties: { name: "Ada Lovelace", tier: "gold", since: "2024-01-15" },
};

export const graphNode2: GraphNodeFixture = {
  $type: "node",
  identity: 43,
  elementId: "4:9e2c1f0a-6d3b-4c8e-b1a7-2f5d8c9e0b11:43",
  labels: ["Customer"],
  properties: { name: "Grace Hopper", tier: "silver", since: "2025-03-02" },
};

/** A date — a calendar day, not an instant. */
export const dateOnly = "2026-09-01";

/** A date-time with an offset: an ISO-8601 string, never a JS `Date`. */
export const timestamp = "2026-09-01T10:15:00.000Z";

/** A duration or interval: one ISO-8601 form from every connector (#1904). */
export const duration = "P1M2DT3S";

/** A total stored as text, or a NUMERIC from a connector that does not promote. */
export const numericString = "48210.50";

/** The #1622 shape: coordinates that are strings, not numbers. */
export const stringCoordinates = { lat: "45.4642", lng: "9.1900" };

/** One column, five rows, five kinds of "number". */
export const mixedColumn: ReadonlyArray<unknown> = [12, "n/a", null, "7", "  "];

/** Region names real data uses, that the world GeoJSON does not. */
export const aliasNeedingRegions = [
  { name: "USA", value: 100 },
  { name: "Czech Republic", value: 50 },
];

export interface OrderRow {
  order_id: number;
  status: string;
  /** numeric string, null, or whitespace — never a clean number */
  total: string | null;
  /** date-only string or null */
  shipped_on: string | null;
  customer: GraphNodeFixture | null;
  note: string | null;
  /** an ISO-8601 date-time string */
  placed_at: string;
}

/**
 * Four orders the way a `LEFT JOIN` returns them: a null total, a null ship
 * date, a null customer, a whitespace total, a node-valued cell, a date-time cell.
 * Row order is stable; tests index into it.
 */
export function sparseOrders(): OrderRow[] {
  return [
    {
      order_id: 1001,
      status: "delivered",
      total: numericString,
      shipped_on: dateOnly,
      customer: graphNode,
      note: null,
      placed_at: timestamp,
    },
    {
      order_id: 1002,
      status: "pending",
      total: null,
      shipped_on: null,
      customer: graphNode2,
      note: "gift",
      placed_at: timestamp,
    },
    {
      order_id: 1003,
      status: "delivered",
      total: "120",
      shipped_on: "2026-09-03",
      customer: null,
      note: null,
      placed_at: timestamp,
    },
    {
      order_id: 1004,
      status: "cancelled",
      total: "  ",
      shipped_on: "2026-09-04",
      customer: graphNode,
      note: "n/a",
      placed_at: timestamp,
    },
  ];
}

/** Copy of `rows` with `rows[index][key]` set to null. */
export function withNullAt<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
  index: number,
): T[] {
  return rows.map((r, i) => (i === index ? { ...r, [key]: null } : r));
}
