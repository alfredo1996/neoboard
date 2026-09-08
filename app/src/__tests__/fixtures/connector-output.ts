/**
 * Connector-shaped fixtures (#1636).
 *
 * What a real result set looks like, as the connectors actually emit it — the
 * shapes no chart or transform fixture reflected before this file existed:
 *
 * - A Neo4j node arrives as a plain `{ identity, elementId, labels, properties }`
 *   object (Neo4jRecordParser), never a driver `Node` instance.
 * - A Neo4j `date` and a PostgreSQL DATE both arrive as a `'YYYY-MM-DD'` string
 *   (#1651, #1654). Assuming a Date at UTC midnight is how #1616 shipped.
 * - A PostgreSQL TIMESTAMP still arrives as a JS `Date` (node-pg).
 * - A number stored as a string arrives as a string (`"48210.50"`): Neo4j string
 *   properties, third-party connectors. The built-in pg parser promotes NUMERIC
 *   (#1307), but the transform layer may not assume every number is a number —
 *   #1622 shipped from string coordinates.
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

export interface Neo4jNode {
  identity: number;
  elementId: string;
  labels: string[];
  properties: Record<string, unknown>;
}

/** A Customer node exactly as the Neo4j parser hands it to the app. */
export const neo4jNode: Neo4jNode = {
  identity: 42,
  elementId: "4:9e2c1f0a-6d3b-4c8e-b1a7-2f5d8c9e0b11:42",
  labels: ["Customer"],
  properties: { name: "Ada Lovelace", tier: "gold", since: "2024-01-15" },
};

export const neo4jNode2: Neo4jNode = {
  identity: 43,
  elementId: "4:9e2c1f0a-6d3b-4c8e-b1a7-2f5d8c9e0b11:43",
  labels: ["Customer"],
  properties: { name: "Grace Hopper", tier: "silver", since: "2025-03-02" },
};

/** Neo4j `date` / PostgreSQL DATE — a calendar day, not an instant. */
export const dateOnly = "2026-09-01";

/** PostgreSQL TIMESTAMP as node-pg delivers it. */
export const timestamp = new Date("2026-09-01T10:15:00.000Z");

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
  customer: Neo4jNode | null;
  note: string | null;
  placed_at: Date;
}

/**
 * Four orders the way a `LEFT JOIN` returns them: a null total, a null ship
 * date, a null customer, a whitespace total, a node-valued cell, a Date cell.
 * Row order is stable; tests index into it.
 */
export function sparseOrders(): OrderRow[] {
  return [
    {
      order_id: 1001,
      status: "delivered",
      total: numericString,
      shipped_on: dateOnly,
      customer: neo4jNode,
      note: null,
      placed_at: timestamp,
    },
    {
      order_id: 1002,
      status: "pending",
      total: null,
      shipped_on: null,
      customer: neo4jNode2,
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
      customer: neo4jNode,
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
