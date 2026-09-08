/**
 * Connector-shaped fixtures (#1636) — component copy.
 *
 * Deliberately duplicated from app/src/__tests__/fixtures/connector-output.ts:
 * component/ may not import app/ (the boundary hooks enforce it), and hosting
 * this in @neoboard/connector-sdk would add a runtime dependency this package
 * does not have and #1595 ratchets against. Keep the two files in step.
 *
 * What a real result set looks like, as the connectors actually emit it:
 * - A Neo4j node is a plain `{ identity, elementId, labels, properties }`.
 * - A Neo4j `date` / PostgreSQL DATE is a `'YYYY-MM-DD'` string (#1651, #1654).
 * - A PostgreSQL TIMESTAMP is a JS `Date`.
 * - A number stored as text arrives as text (`"48210.50"`); coordinates too (#1622).
 * - A missing cell is `null`; a "blank" cell can be whitespace.
 */

export interface Neo4jNode {
  identity: number;
  elementId: string;
  labels: string[];
  properties: Record<string, unknown>;
}

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

export const dateOnly = "2026-09-01";
export const timestamp = new Date("2026-09-01T10:15:00.000Z");
export const numericString = "48210.50";
export const stringCoordinates = { lat: "45.4642", lng: "9.1900" };
export const mixedColumn: ReadonlyArray<unknown> = [12, "n/a", null, "7", "  "];

/** Region names real data uses, that the world GeoJSON does not. */
export const aliasNeedingRegions = [
  { name: "USA", value: 100 },
  { name: "Czech Republic", value: 50 },
];

export interface OrderRow {
  order_id: number;
  status: string;
  total: string | null;
  shipped_on: string | null;
  customer: Neo4jNode | null;
  note: string | null;
  placed_at: Date;
}

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
