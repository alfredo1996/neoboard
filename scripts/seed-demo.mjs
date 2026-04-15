#!/usr/bin/env node

/**
 * Seed demo connectors and dashboards into the NeoBoard database.
 *
 * Idempotent — checks by name before inserting. Safe to run multiple times.
 *
 * Usage:
 *   node scripts/seed-demo.mjs
 *   node scripts/seed-demo.mjs --only=chart-gallery,click-actions
 *   node scripts/seed-demo.mjs --reset
 *
 * Called by `neoboard demo seed` / `neoboard demo reset` (cli/).
 */

import { createRequire } from "module";
import { randomBytes, createCipheriv, randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  generateAll as generateEcommerceData,
  insertAll as insertEcommerceData,
} from "./demo/ecommerce-data.mjs";
import { SHOWCASES, parseOnlyFlag } from "./demo/showcases.mjs";
import { importShowcase } from "./demo/import-dashboard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, "../app/") + "/");
const postgres = require("postgres");
const bcrypt = require("bcryptjs");

// ─── Helpers ─────────────────────────────────────────────────────────

/** Parse a .env file into a key-value map (no shell expansion). */
function parseEnvFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/** AES-256-GCM encrypt matching app/src/lib/crypto.ts */
function encryptJson(data, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function uuid() {
  return randomUUID();
}

// ─── Argv parsing (for --only and --reset) ───────────────────────────

/**
 * Parses top-level script args. Accepts:
 *   --only=<keys>   Comma-separated showcase keys
 *   --reset         Delete showcase state instead of seeding
 */
function parseArgs(argv) {
  let only;
  let reset = false;
  for (const arg of argv.slice(2)) {
    if (arg === "--reset") {
      reset = true;
    } else if (arg.startsWith("--only=")) {
      only = arg.slice("--only=".length);
    }
  }
  return { only, reset };
}

// ─── Ecommerce schema management ─────────────────────────────────────

const DEMO_SCHEMA = "neoboard_demo_public";

/** Guard against dropping anything that isn't an isolated demo schema. */
function assertDemoSchema(name) {
  if (!/^neoboard_demo_[a-z_]+$/.test(name)) {
    throw new Error(
      `Refusing to drop schema "${name}" — only neoboard_demo_* schemas may be reset.`,
    );
  }
}

/** Drops the demo schema and recreates it from ecommerce-schema.sql. */
async function recreateEcommerceSchema(sql) {
  assertDemoSchema(DEMO_SCHEMA);
  const ddl = readFileSync(
    resolve(__dirname, "demo/ecommerce-schema.sql"),
    "utf8",
  );
  console.log(`    Dropping + recreating schema ${DEMO_SCHEMA}...`);
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${DEMO_SCHEMA} CASCADE`);
  await sql.unsafe(ddl);
}

/** Inserts deterministic synthetic rows into the demo schema. */
async function seedEcommerceData(sql) {
  const data = generateEcommerceData();
  console.log(
    `    Inserting ${data.customers.length} customers, ${data.products.length} products, ${data.orders.length} orders...`,
  );
  await insertEcommerceData(sql, data);
}

/**
 * Deletes showcase dashboards by name and drops the demo Postgres schema.
 * Called by `neoboard demo reset` — intentionally destructive but scoped.
 */
async function resetDemo(sql, adminId) {
  const names = SHOWCASES.map((s) => s.label);
  if (names.length > 0) {
    const deleted = await sql`
      DELETE FROM "dashboard"
      WHERE "userId" = ${adminId}
        AND name IN ${sql(names)}
      RETURNING id
    `;
    console.log(`    Deleted ${deleted.length} showcase dashboard(s).`);
  }
  assertDemoSchema(DEMO_SCHEMA);
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${DEMO_SCHEMA} CASCADE`);
  console.log(`    Dropped schema ${DEMO_SCHEMA}.`);
}

// ─── Dashboard layouts ───────────────────────────────────────────────

export function buildWidgetShowcase(neo4jConnId, pgConnId) {
  // Click action page needs stable IDs for page navigation
  const clickPageId = uuid();

  return {
    version: 2,
    pages: [
      // ── Page 1: Simple Charts — one widget per chart type, no styling ──
      {
        id: uuid(),
        title: "Simple Charts",
        widgets: [
          {
            id: uuid(),
            chartType: "bar",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade",
            settings: { title: "Movies by Decade" },
          },
          {
            id: uuid(),
            chartType: "line",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN m.released AS year, count(*) AS count ORDER BY year",
            settings: { title: "Releases Over Time" },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count",
            settings: { title: "Relationship Types" },
          },
          {
            id: uuid(),
            chartType: "single-value",
            connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN count(m) AS value",
            settings: { title: "Total Movies" },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN m.title AS title, m.released AS released, m.tagline AS tagline ORDER BY m.released DESC",
            settings: { title: "All Movies" },
          },
          {
            id: uuid(),
            chartType: "gauge",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN count(m) AS value, 'Total Movies' AS name",
            settings: { title: "Movie Count" },
          },
          {
            id: uuid(),
            chartType: "radar",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS indicator, count(*) AS value RETURN indicator, value",
            settings: { title: "Relationship Radar" },
          },
          {
            id: uuid(),
            chartType: "sankey",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r]->(m:Movie) WHERE type(r) IN ['ACTED_IN','DIRECTED'] WITH p.name AS source, m.title AS target, 1 AS value RETURN source, target, value LIMIT 20",
            settings: { title: "People \u2192 Movies" },
          },
          {
            id: uuid(),
            chartType: "treemap",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH m, count(p) AS cast RETURN m.title AS name, cast AS value ORDER BY cast DESC LIMIT 15",
            settings: { title: "Movies by Cast Size" },
          },
          {
            id: uuid(),
            chartType: "sunburst",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() WITH type(r) AS relType, count(*) AS cnt RETURN '' AS parent, relType AS name, cnt AS value UNION ALL MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS relType, m.title AS movie, count(p) AS cnt RETURN relType AS parent, movie AS name, cnt AS value UNION ALL MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS parent, p.name AS name, 1 AS value LIMIT 20",
            settings: { title: "Movies by Relationship" },
          },
        ],
        gridLayout: [
          // Row 1: bar(6×4) line(6×4)
          { i: null, x: 0, y: 0, w: 6, h: 4 },
          { i: null, x: 6, y: 0, w: 6, h: 4 },
          // Row 2: pie(4×4) single-value(4×2) table(4×4)
          { i: null, x: 0, y: 4, w: 4, h: 4 },
          { i: null, x: 4, y: 4, w: 4, h: 2 },
          { i: null, x: 8, y: 4, w: 4, h: 4 },
          // Row 3: gauge(3×3) radar(4×4) sankey(5×4)
          { i: null, x: 0, y: 8, w: 3, h: 3 },
          { i: null, x: 3, y: 8, w: 4, h: 4 },
          { i: null, x: 7, y: 8, w: 5, h: 4 },
          // Row 4: treemap(6×4) sunburst(6×4)
          { i: null, x: 0, y: 12, w: 6, h: 4 },
          { i: null, x: 6, y: 12, w: 6, h: 4 },
        ],
      },

      // ── Page 2: Rule-Based Styling ──
      {
        id: uuid(),
        title: "Rule-Based Styling",
        widgets: [
          {
            id: uuid(),
            chartType: "bar",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade",
            settings: {
              title: "Movies by Decade (red \u2264 2, amber \u2264 5, green \u2264 10)",
              stylingConfig: {
                enabled: true,
                rules: [
                  { id: uuid(), operator: "<=", value: 2, color: "#ef4444", target: "color" },
                  { id: uuid(), operator: "<=", value: 5, color: "#f59e0b", target: "color" },
                  { id: uuid(), operator: "<=", value: 10, color: "#22c55e", target: "color" },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "single-value",
            connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN count(m) AS value",
            settings: {
              title: "Total Movies (blue > 30)",
              stylingConfig: {
                enabled: true,
                rules: [
                  { id: uuid(), operator: ">", value: 30, color: "#3b82f6", target: "color" },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY m.released DESC",
            settings: {
              title: "Movies (row color by year)",
              stylingConfig: {
                enabled: true,
                rules: [
                  { id: uuid(), column: "released", operator: "<=", value: 1995, color: "#3b82f620", target: "backgroundColor" },
                  { id: uuid(), column: "released", operator: "<=", value: 2005, color: "#22c55e20", target: "backgroundColor" },
                  { id: uuid(), column: "released", operator: "<=", value: 2015, color: "#f59e0b20", target: "backgroundColor" },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "treemap",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH m, count(p) AS cast RETURN m.title AS name, cast AS value ORDER BY cast DESC LIMIT 15",
            settings: {
              title: "Cast Size (red > 5, green \u2264 3)",
              stylingConfig: {
                enabled: true,
                rules: [
                  { id: uuid(), operator: ">", value: 5, color: "#ef4444", target: "color" },
                  { id: uuid(), operator: "<=", value: 3, color: "#22c55e", target: "color" },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "gauge",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN count(m) AS value, 'Movies' AS name",
            settings: {
              title: "Movie Count (blue > 30)",
              stylingConfig: {
                enabled: true,
                rules: [
                  { id: uuid(), operator: ">", value: 30, color: "#3b82f6", target: "color" },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "sunburst",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() WITH type(r) AS relType, count(*) AS cnt RETURN '' AS parent, relType AS name, cnt AS value UNION ALL MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS relType, m.title AS movie, count(p) AS cnt RETURN relType AS parent, movie AS name, cnt AS value UNION ALL MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS parent, p.name AS name, 1 AS value LIMIT 20",
            settings: {
              title: "Hierarchy (orange > 10)",
              stylingConfig: {
                enabled: true,
                rules: [
                  { id: uuid(), operator: ">", value: 10, color: "#f97316", target: "color" },
                ],
              },
            },
          },
        ],
        gridLayout: [
          // Row 1: bar(6×4) single-value(3×2) table(6×4)
          { i: null, x: 0, y: 0, w: 6, h: 4 },
          { i: null, x: 6, y: 0, w: 3, h: 2 },
          { i: null, x: 6, y: 2, w: 6, h: 4 },
          // Row 2: treemap(4×4) gauge(3×3) sunburst(5×4)
          { i: null, x: 0, y: 6, w: 4, h: 4 },
          { i: null, x: 4, y: 6, w: 3, h: 3 },
          { i: null, x: 7, y: 6, w: 5, h: 4 },
        ],
      },

      // ── Page 3: Click Actions — with parameter-select to show the clicked value ──
      {
        id: clickPageId,
        title: "Click Actions",
        widgets: [
          {
            id: uuid(),
            chartType: "bar",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade",
            settings: {
              title: "Click a bar to set decade",
              clickAction: {
                type: "set-parameter",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter",
                    triggerColumn: "decade",
                    parameterMapping: { parameterName: "clicked_decade", sourceField: "decade" },
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: {
              title: "Click a slice to set relationship",
              clickAction: {
                type: "set-parameter",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter",
                    triggerColumn: "name",
                    parameterMapping: { parameterName: "clicked_rel", sourceField: "name" },
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "treemap",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH m, count(p) AS cast RETURN m.title AS name, cast AS value ORDER BY cast DESC LIMIT 15",
            settings: {
              title: "Click a movie to filter table",
              clickAction: {
                type: "set-parameter",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter",
                    triggerColumn: "name",
                    parameterMapping: { parameterName: "selected_movie", sourceField: "name" },
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: neo4jConnId,
            query: "",
            settings: {
              title: "Selected Movie",
              chartOptions: {
                parameterType: "select",
                parameterName: "selected_movie",
                seedQuery:
                  "MATCH (m:Movie) RETURN m.title AS value, m.title AS label ORDER BY m.title",
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r]->(m:Movie) WHERE m.title = $param_selected_movie RETURN p.name AS Person, type(r) AS Role",
            settings: { title: "Cast & Crew (filtered by click)" },
          },
        ],
        gridLayout: [
          // Row 1: bar(4×4) pie(4×4) treemap(4×4)
          { i: null, x: 0, y: 0, w: 4, h: 4 },
          { i: null, x: 4, y: 0, w: 4, h: 4 },
          { i: null, x: 8, y: 0, w: 4, h: 4 },
          // Row 2: parameter-select(4×2) table(8×4)
          { i: null, x: 0, y: 4, w: 4, h: 2 },
          { i: null, x: 4, y: 4, w: 8, h: 4 },
        ],
      },

      // ── Page 4: Color Palettes — one pie per palette ──
      {
        id: uuid(),
        title: "Color Palettes",
        widgets: [
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "deep-ocean (default)", chartOptions: { colorPalette: "deep-ocean" } },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "warm-sunset", chartOptions: { colorPalette: "warm-sunset" } },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "cool-breeze", chartOptions: { colorPalette: "cool-breeze" } },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "earth-tones", chartOptions: { colorPalette: "earth-tones" } },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "neon", chartOptions: { colorPalette: "neon" } },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "monochrome", chartOptions: { colorPalette: "monochrome" } },
          },
        ],
        gridLayout: [
          // 3×2 grid of pie charts
          { i: null, x: 0, y: 0, w: 4, h: 4 },
          { i: null, x: 4, y: 0, w: 4, h: 4 },
          { i: null, x: 8, y: 0, w: 4, h: 4 },
          { i: null, x: 0, y: 4, w: 4, h: 4 },
          { i: null, x: 4, y: 4, w: 4, h: 4 },
          { i: null, x: 8, y: 4, w: 4, h: 4 },
        ],
      },

      // ── Page 5: Accessibility — colorblind mode ──
      {
        id: uuid(),
        title: "Accessibility",
        widgets: [
          {
            id: uuid(),
            chartType: "bar",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade",
            settings: {
              title: "Movies by Decade (Colorblind Mode)",
              chartOptions: { colorblindMode: true },
            },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 8, h: 5 },
        ],
      },

    ],
  };
}

export function buildParameterTesting(neo4jConnId, pgConnId) {
  return {
    version: 2,
    pages: [
      // ── Page 1: Neo4j — Select ──
      {
        id: uuid(),
        title: "Neo4j — Select",
        widgets: [
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: neo4jConnId,
            query: "",
            settings: {
              title: "Movie Selector",
              chartOptions: {
                parameterType: "select",
                parameterName: "movie",
                seedQuery:
                  "MATCH (m:Movie) RETURN m.title AS value, m.title AS label ORDER BY m.title",
              },
            },
          },
          {
            id: uuid(),
            chartType: "bar",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r]->(m:Movie) WHERE m.title = $param_movie RETURN p.name AS name, type(r) AS role",
            settings: { title: "Cast & Crew" },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r]->(m:Movie) WHERE m.title = $param_movie RETURN p.name AS person, type(r) AS relationship, r.roles AS roles",
            settings: { title: "Movie Details" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 8, h: 4 },
          { i: null, x: 0, y: 2, w: 4, h: 4 },
        ],
      },

      // ── Page 2: Neo4j — Multi-Select ──
      {
        id: uuid(),
        title: "Neo4j — Multi-Select",
        widgets: [
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: neo4jConnId,
            query: "",
            settings: {
              title: "Person Selector",
              chartOptions: {
                parameterType: "multi-select",
                parameterName: "person",
                seedQuery:
                  "MATCH (p:Person) RETURN p.name AS value, p.name AS label ORDER BY p.name",
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r]->(m:Movie) WHERE p.name IN $param_person RETURN p.name AS person, m.title AS movie, type(r) AS role ORDER BY p.name",
            settings: { title: "Filmography" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 8, h: 4 },
        ],
      },

      // ── Page 3: Neo4j — Freetext ──
      {
        id: uuid(),
        title: "Neo4j — Freetext",
        widgets: [
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: "",
            query: "",
            settings: {
              title: "Search",
              chartOptions: {
                parameterType: "text",
                parameterName: "search",
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) WHERE toLower(m.title) CONTAINS toLower($param_search) RETURN m.title, m.released, m.tagline ORDER BY m.released",
            settings: { title: "Results" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 8, h: 4 },
        ],
      },

      // ── Page 4: Neo4j — Date Pickers ──
      {
        id: uuid(),
        title: "Neo4j — Date Pickers",
        widgets: [
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: "",
            query: "",
            settings: {
              title: "Single Date",
              chartOptions: {
                parameterType: "date",
                parameterName: "date",
              },
            },
          },
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: "",
            query: "",
            settings: {
              title: "Date Range",
              chartOptions: {
                parameterType: "date-range",
                parameterName: "daterange",
              },
            },
          },
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: "",
            query: "",
            settings: {
              title: "Relative Date",
              chartOptions: {
                parameterType: "date-relative",
                parameterName: "reldate",
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN m.title, m.released, m.tagline ORDER BY m.released",
            settings: { title: "Movies" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 4, h: 2 },
          { i: null, x: 8, y: 0, w: 4, h: 2 },
          { i: null, x: 0, y: 2, w: 12, h: 4 },
        ],
      },

      // ── Page 5: PostgreSQL — Select ──
      {
        id: uuid(),
        title: "PostgreSQL — Select",
        widgets: [
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: pgConnId,
            query: "",
            settings: {
              title: "Movie Selector",
              chartOptions: {
                parameterType: "select",
                parameterName: "pg_movie",
                seedQuery:
                  "SELECT title AS value, title AS label FROM movies ORDER BY title",
              },
            },
          },
          {
            id: uuid(),
            chartType: "bar",
            connectionId: pgConnId,
            query:
              "SELECT p.name, r.relationship FROM roles r JOIN people p ON r.person_id = p.id JOIN movies m ON r.movie_id = m.id WHERE m.title = $param_pg_movie",
            settings: { title: "Cast" },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT p.name AS person, r.relationship, r.roles FROM roles r JOIN people p ON r.person_id = p.id JOIN movies m ON r.movie_id = m.id WHERE m.title = $param_pg_movie",
            settings: { title: "Details" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 8, h: 4 },
          { i: null, x: 0, y: 2, w: 4, h: 4 },
        ],
      },

      // ── Page 6: PostgreSQL — Multi-Select ──
      {
        id: uuid(),
        title: "PostgreSQL — Multi-Select",
        widgets: [
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: pgConnId,
            query: "",
            settings: {
              title: "Person Selector",
              chartOptions: {
                parameterType: "multi-select",
                parameterName: "pg_person",
                seedQuery:
                  "SELECT name AS value, name AS label FROM people ORDER BY name",
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT p.name AS person, m.title AS movie, r.relationship FROM roles r JOIN people p ON r.person_id = p.id JOIN movies m ON r.movie_id = m.id WHERE p.name = ANY($param_pg_person) ORDER BY p.name",
            settings: { title: "Filmography" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 8, h: 4 },
        ],
      },

      // ── Page 7: PostgreSQL — Freetext ──
      {
        id: uuid(),
        title: "PostgreSQL — Freetext",
        widgets: [
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: "",
            query: "",
            settings: {
              title: "Search",
              chartOptions: {
                parameterType: "text",
                parameterName: "pg_search",
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT title, released, tagline FROM movies WHERE title ILIKE '%' || $param_pg_search || '%' ORDER BY released",
            settings: { title: "Results" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 8, h: 4 },
        ],
      },

      // ── Page 8: PostgreSQL — Date Pickers ──
      {
        id: uuid(),
        title: "PostgreSQL — Date Pickers",
        widgets: [
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: "",
            query: "",
            settings: {
              title: "Single Date",
              chartOptions: {
                parameterType: "date",
                parameterName: "pg_date",
              },
            },
          },
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: "",
            query: "",
            settings: {
              title: "Date Range",
              chartOptions: {
                parameterType: "date-range",
                parameterName: "pg_daterange",
              },
            },
          },
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: "",
            query: "",
            settings: {
              title: "Relative Date",
              chartOptions: {
                parameterType: "date-relative",
                parameterName: "pg_reldate",
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT title, released, tagline FROM movies ORDER BY released",
            settings: { title: "Movies" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 4, h: 2 },
          { i: null, x: 8, y: 0, w: 4, h: 2 },
          { i: null, x: 0, y: 2, w: 12, h: 4 },
        ],
      },

      // ── Page 9: Neo4j — Cascading Select ──
      {
        id: uuid(),
        title: "Neo4j — Cascading Select",
        widgets: [
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: neo4jConnId,
            query: "",
            settings: {
              title: "Director",
              chartOptions: {
                parameterType: "select",
                parameterName: "director",
                seedQuery:
                  "MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN DISTINCT p.name AS value, p.name AS label ORDER BY p.name",
              },
            },
          },
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: neo4jConnId,
            query: "",
            settings: {
              title: "Movie by Director",
              chartOptions: {
                parameterType: "cascading-select",
                parameterName: "dir_movie",
                parentParameterName: "director",
                seedQuery:
                  "MATCH (p:Person)-[:DIRECTED]->(m:Movie) WHERE p.name = $param_director RETURN m.title AS value, m.title AS label ORDER BY m.title",
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) WHERE m.title = $param_dir_movie RETURN p.name AS actor, r.roles AS roles",
            settings: { title: "Cast" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 4, h: 2 },
          { i: null, x: 0, y: 2, w: 12, h: 4 },
        ],
      },

      // ── Page 10: PostgreSQL — Cascading Select ──
      {
        id: uuid(),
        title: "PostgreSQL — Cascading Select",
        widgets: [
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: pgConnId,
            query: "",
            settings: {
              title: "Movie",
              chartOptions: {
                parameterType: "select",
                parameterName: "pg_cas_movie",
                seedQuery:
                  "SELECT title AS value, title AS label FROM movies ORDER BY title",
              },
            },
          },
          {
            id: uuid(),
            chartType: "parameter-select",
            connectionId: pgConnId,
            query: "",
            settings: {
              title: "Actor in Movie",
              chartOptions: {
                parameterType: "cascading-select",
                parameterName: "pg_cas_actor",
                parentParameterName: "pg_cas_movie",
                seedQuery:
                  "SELECT p.name AS value, p.name AS label FROM roles r JOIN people p ON r.person_id = p.id JOIN movies m ON r.movie_id = m.id WHERE m.title = $param_pg_cas_movie AND r.relationship = 'ACTED_IN' ORDER BY p.name",
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT p.name AS actor, r.roles, r.relationship FROM roles r JOIN people p ON r.person_id = p.id JOIN movies m ON r.movie_id = m.id WHERE m.title = $param_pg_cas_movie AND p.name = $param_pg_cas_actor",
            settings: { title: "Role Details" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 4, h: 2 },
          { i: null, x: 0, y: 2, w: 12, h: 4 },
        ],
      },
    ],
  };
}

export function buildFormTesting(neo4jConnId, pgConnId) {
  return {
    version: 2,
    pages: [
      // ── Page 1: Neo4j Forms ──
      {
        id: uuid(),
        title: "Neo4j Forms",
        widgets: [
          {
            id: uuid(),
            chartType: "form",
            connectionId: neo4jConnId,
            query:
              "CREATE (n:Feedback {author: $param_author, message: $param_message, rating: toInteger($param_rating_min)}) RETURN n.author AS author",
            settings: {
              title: "Submit Feedback",
              formFields: [
                {
                  id: uuid(),
                  label: "Author",
                  parameterName: "author",
                  parameterType: "text",
                  placeholder: "Your name",
                },
                {
                  id: uuid(),
                  label: "Message",
                  parameterName: "message",
                  parameterType: "text",
                  placeholder: "Your feedback...",
                },
                {
                  id: uuid(),
                  label: "Rating (1–5)",
                  parameterName: "rating",
                  parameterType: "number-range",
                  rangeMin: 1,
                  rangeMax: 5,
                  rangeStep: 1,
                },
              ],
              chartOptions: {
                submitButtonText: "Send Feedback",
                successMessage: "Feedback submitted!",
                resetOnSuccess: true,
              },
            },
          },
          {
            id: uuid(),
            chartType: "form",
            connectionId: neo4jConnId,
            query:
              "CREATE (p:Person {name: $param_name, born: toInteger($param_born_min)}) RETURN p.name AS name",
            settings: {
              title: "Add Person",
              formFields: [
                {
                  id: uuid(),
                  label: "Name",
                  parameterName: "name",
                  parameterType: "text",
                  placeholder: "Full name",
                },
                {
                  id: uuid(),
                  label: "Born",
                  parameterName: "born",
                  parameterType: "number-range",
                  rangeMin: 1900,
                  rangeMax: 2010,
                  rangeStep: 1,
                },
              ],
              chartOptions: {
                submitButtonText: "Create Person",
                successMessage: "Person created successfully!",
                resetOnSuccess: true,
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (n:Feedback) RETURN n.author AS author, n.message AS message, n.rating AS rating ORDER BY n.author",
            settings: { title: "Feedback Entries" },
          },
          {
            id: uuid(),
            chartType: "single-value",
            connectionId: neo4jConnId,
            query: "MATCH (n:Feedback) RETURN count(n) AS value",
            settings: { title: "Total Feedback" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 5 },
          { i: null, x: 4, y: 0, w: 4, h: 4 },
          { i: null, x: 0, y: 5, w: 8, h: 4 },
          { i: null, x: 8, y: 0, w: 4, h: 2 },
        ],
      },

      // ── Page 2: PostgreSQL Forms ──
      {
        id: uuid(),
        title: "PostgreSQL Forms",
        widgets: [
          {
            id: uuid(),
            chartType: "form",
            connectionId: pgConnId,
            query:
              "INSERT INTO movies (title, released, tagline) VALUES ($param_title, CAST($param_released_min AS INTEGER), $param_tagline) RETURNING title",
            settings: {
              title: "Add Movie",
              formFields: [
                {
                  id: uuid(),
                  label: "Title",
                  parameterName: "title",
                  parameterType: "text",
                  placeholder: "Movie title",
                },
                {
                  id: uuid(),
                  label: "Year Released",
                  parameterName: "released",
                  parameterType: "number-range",
                  rangeMin: 1900,
                  rangeMax: 2030,
                  rangeStep: 1,
                },
                {
                  id: uuid(),
                  label: "Tagline",
                  parameterName: "tagline",
                  parameterType: "text",
                  placeholder: "Tagline",
                },
              ],
              chartOptions: {
                submitButtonText: "Insert Movie",
                successMessage: "Movie added to the database!",
                resetOnSuccess: true,
              },
            },
          },
          {
            id: uuid(),
            chartType: "form",
            connectionId: pgConnId,
            query:
              "INSERT INTO people (name, born) VALUES ($param_name, CAST($param_born_min AS INTEGER)) RETURNING name",
            settings: {
              title: "Add Person",
              formFields: [
                {
                  id: uuid(),
                  label: "Name",
                  parameterName: "name",
                  parameterType: "text",
                  placeholder: "Full name",
                },
                {
                  id: uuid(),
                  label: "Born",
                  parameterName: "born",
                  parameterType: "number-range",
                  rangeMin: 1900,
                  rangeMax: 2010,
                  rangeStep: 1,
                },
              ],
              chartOptions: {
                submitButtonText: "Insert Person",
                successMessage: "Person added!",
                resetOnSuccess: true,
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT title, released, tagline FROM movies ORDER BY released DESC LIMIT 20",
            settings: { title: "Recent Movies" },
          },
          {
            id: uuid(),
            chartType: "single-value",
            connectionId: pgConnId,
            query: "SELECT count(*) AS value FROM movies",
            settings: { title: "Total Movies" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 5 },
          { i: null, x: 4, y: 0, w: 4, h: 4 },
          { i: null, x: 0, y: 5, w: 8, h: 4 },
          { i: null, x: 8, y: 0, w: 4, h: 2 },
        ],
      },
    ],
  };
}

export function buildClickActionDemo(neo4jConnId, pgConnId) {
  // Page IDs are pre-generated so widgets can reference them in click actions
  const page1Id = uuid();
  const page2Id = uuid();
  const page3Id = uuid();
  const page4Id = uuid();
  const page5Id = uuid();
  const page6Id = uuid();
  const page7Id = uuid();
  const page8Id = uuid();

  return {
    version: 2,
    pages: [
      // ── Page 1: Cell-Click → Set Parameter (Neo4j) ──
      {
        id: page1Id,
        title: "Cell Click → Parameter",
        widgets: [
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY m.released DESC LIMIT 20",
            settings: {
              title: "Click a movie title cell",
              clickAction: {
                type: "set-parameter",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter",
                    triggerColumn: "title",
                    parameterMapping: {
                      parameterName: "clicked_movie",
                      sourceField: "title",
                    },
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "bar",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r]->(m:Movie) WHERE m.title = $param_clicked_movie RETURN p.name AS name, type(r) AS role",
            settings: { title: "Cast & Crew for $param_clicked_movie" },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r]->(m:Movie) WHERE m.title = $param_clicked_movie RETURN p.name AS person, type(r) AS role, r.roles AS roles",
            settings: { title: "Details" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 5, h: 4 },
          { i: null, x: 5, y: 0, w: 7, h: 4 },
          { i: null, x: 0, y: 4, w: 12, h: 3 },
        ],
      },

      // ── Page 2: Bar Click → Set Parameter (Neo4j) ──
      {
        id: page2Id,
        title: "Bar Click → Parameter",
        widgets: [
          {
            id: uuid(),
            chartType: "bar",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade",
            settings: {
              title: "Click a decade bar",
              clickAction: {
                type: "set-parameter",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter",
                    parameterMapping: {
                      parameterName: "clicked_decade",
                      sourceField: "name",
                    },
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) WHERE (m.released / 10) * 10 = toInteger($param_clicked_decade) RETURN m.title AS title, m.released AS year ORDER BY m.released",
            settings: { title: "Movies in decade $param_clicked_decade" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 4 },
          { i: null, x: 6, y: 0, w: 6, h: 4 },
        ],
      },

      // ── Page 3: Navigate to Page + Set Parameter ──
      {
        id: page3Id,
        title: "Navigate to Page",
        widgets: [
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN m.title AS title, m.released AS released, m.tagline AS tagline ORDER BY m.title LIMIT 15",
            settings: {
              title: "Click a title → navigate to Page 1 + set parameter",
              clickAction: {
                type: "set-parameter-and-navigate",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter-and-navigate",
                    triggerColumn: "title",
                    parameterMapping: {
                      parameterName: "clicked_movie",
                      sourceField: "title",
                    },
                    targetPageId: page1Id,
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count",
            settings: {
              title: "Click a slice → navigate to Bar page",
              clickAction: {
                type: "navigate-to-page",
                rules: [
                  {
                    id: uuid(),
                    type: "navigate-to-page",
                    targetPageId: page2Id,
                  },
                ],
              },
            },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 7, h: 4 },
          { i: null, x: 7, y: 0, w: 5, h: 4 },
        ],
      },

      // ── Page 4: Multi-Rule Table (Neo4j) ──
      // Demonstrates multiple action rules on a single table widget:
      // - Clicking "title" column → sets param_movie
      // - Clicking "released" column → sets param_year
      {
        id: page4Id,
        title: "Multi-Rule Table",
        widgets: [
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN m.title AS title, m.released AS released, m.tagline AS tagline ORDER BY m.released DESC LIMIT 25",
            settings: {
              title: "Click title or released column",
              clickAction: {
                type: "set-parameter",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter",
                    triggerColumn: "title",
                    parameterMapping: {
                      parameterName: "movie",
                      sourceField: "title",
                    },
                  },
                  {
                    id: uuid(),
                    type: "set-parameter",
                    triggerColumn: "released",
                    parameterMapping: {
                      parameterName: "year",
                      sourceField: "released",
                    },
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "bar",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r]->(m:Movie) WHERE m.title = $param_movie RETURN p.name AS name, type(r) AS role",
            settings: { title: "Cast & Crew — $param_movie" },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) WHERE m.released = toInteger($param_year) RETURN m.title AS title, m.released AS released, m.tagline AS tagline ORDER BY m.title",
            settings: { title: "Movies released in $param_year" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 5, h: 4 },
          { i: null, x: 5, y: 0, w: 7, h: 4 },
          { i: null, x: 0, y: 4, w: 12, h: 3 },
        ],
      },

      // ── Page 5: PG — Cell Click → Parameter ──
      {
        id: page5Id,
        title: "PG — Cell Click → Parameter",
        widgets: [
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT title, released FROM movies ORDER BY released DESC LIMIT 20",
            settings: {
              title: "Click a movie title cell",
              clickAction: {
                type: "set-parameter",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter",
                    triggerColumn: "title",
                    parameterMapping: {
                      parameterName: "pg_clicked_movie",
                      sourceField: "title",
                    },
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "bar",
            connectionId: pgConnId,
            query:
              "SELECT p.name, r.relationship AS role FROM roles r JOIN people p ON r.person_id = p.id JOIN movies m ON r.movie_id = m.id WHERE m.title = $param_pg_clicked_movie",
            settings: { title: "Cast & Crew — $param_pg_clicked_movie" },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT p.name AS person, r.relationship, r.roles FROM roles r JOIN people p ON r.person_id = p.id JOIN movies m ON r.movie_id = m.id WHERE m.title = $param_pg_clicked_movie",
            settings: { title: "Details" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 5, h: 4 },
          { i: null, x: 5, y: 0, w: 7, h: 4 },
          { i: null, x: 0, y: 4, w: 12, h: 3 },
        ],
      },

      // ── Page 6: PG — Bar Click → Parameter ──
      {
        id: page6Id,
        title: "PG — Bar Click → Parameter",
        widgets: [
          {
            id: uuid(),
            chartType: "bar",
            connectionId: pgConnId,
            query:
              "SELECT (released / 10) * 10 AS decade, count(*) AS count FROM movies GROUP BY decade ORDER BY decade",
            settings: {
              title: "Click a decade bar",
              clickAction: {
                type: "set-parameter",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter",
                    parameterMapping: {
                      parameterName: "pg_clicked_decade",
                      sourceField: "name",
                    },
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT title, released AS year FROM movies WHERE (released / 10) * 10 = $param_pg_clicked_decade::INTEGER ORDER BY released",
            settings: { title: "Movies in decade $param_pg_clicked_decade" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 4 },
          { i: null, x: 6, y: 0, w: 6, h: 4 },
        ],
      },

      // ── Page 7: PG — Navigate to Page ──
      {
        id: page7Id,
        title: "PG — Navigate to Page",
        widgets: [
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT title, released, tagline FROM movies ORDER BY title LIMIT 15",
            settings: {
              title: "Click title → navigate to PG Cell Click page",
              clickAction: {
                type: "set-parameter-and-navigate",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter-and-navigate",
                    triggerColumn: "title",
                    parameterMapping: {
                      parameterName: "pg_clicked_movie",
                      sourceField: "title",
                    },
                    targetPageId: page5Id,
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: pgConnId,
            query:
              "SELECT relationship AS type, count(*) AS count FROM roles GROUP BY relationship",
            settings: {
              title: "Click a slice → navigate to Bar page",
              clickAction: {
                type: "navigate-to-page",
                rules: [
                  {
                    id: uuid(),
                    type: "navigate-to-page",
                    targetPageId: page6Id,
                  },
                ],
              },
            },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 7, h: 4 },
          { i: null, x: 7, y: 0, w: 5, h: 4 },
        ],
      },

      // ── Page 8: PG — Multi-Rule Table ──
      {
        id: page8Id,
        title: "PG — Multi-Rule Table",
        widgets: [
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT title, released, tagline FROM movies ORDER BY released DESC LIMIT 25",
            settings: {
              title: "Click title or released column",
              clickAction: {
                type: "set-parameter",
                rules: [
                  {
                    id: uuid(),
                    type: "set-parameter",
                    triggerColumn: "title",
                    parameterMapping: {
                      parameterName: "pg_movie",
                      sourceField: "title",
                    },
                  },
                  {
                    id: uuid(),
                    type: "set-parameter",
                    triggerColumn: "released",
                    parameterMapping: {
                      parameterName: "pg_year",
                      sourceField: "released",
                    },
                  },
                ],
              },
            },
          },
          {
            id: uuid(),
            chartType: "bar",
            connectionId: pgConnId,
            query:
              "SELECT p.name, r.relationship AS role FROM roles r JOIN people p ON r.person_id = p.id JOIN movies m ON r.movie_id = m.id WHERE m.title = $param_pg_movie",
            settings: { title: "Cast & Crew — $param_pg_movie" },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT title, released, tagline FROM movies WHERE released = $param_pg_year::INTEGER ORDER BY title",
            settings: { title: "Movies released in $param_pg_year" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 5, h: 4 },
          { i: null, x: 5, y: 0, w: 7, h: 4 },
          { i: null, x: 0, y: 4, w: 12, h: 3 },
        ],
      },
    ],
  };
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // Validate --only against the manifest early so we fail fast on typos
  let onlyKeys;
  try {
    onlyKeys = parseOnlyFlag(args.only);
  } catch (err) {
    console.error(`    ${err.message}`);
    process.exit(1);
  }

  const envPath = resolve(__dirname, "../app/.env.local");
  let env;
  try {
    env = parseEnvFile(envPath);
  } catch {
    console.error("    Could not read app/.env.local — skipping seed.");
    process.exit(0);
  }

  const databaseUrl = env.DATABASE_URL;
  const encryptionKey = env.ENCRYPTION_KEY;

  if (!databaseUrl || !encryptionKey) {
    console.error(
      "    DATABASE_URL or ENCRYPTION_KEY missing in .env.local — skipping seed."
    );
    process.exit(0);
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    // Suppress verbose NOTICE logs (schema-does-not-exist, drop cascades, etc.)
    // that clutter the seed output without indicating real problems.
    onnotice: () => {},
  });

  try {
    // 1. Ensure admin user exists
    const users = await sql`
      SELECT id FROM "user" ORDER BY "createdAt" ASC LIMIT 1
    `;

    let adminId;
    if (users.length === 0) {
      console.log("    Creating admin user (admin@neoboard.local / admin123)...");
      adminId = uuid();
      const hash = bcrypt.hashSync("admin123", 10);
      await sql`
        INSERT INTO "user" (id, name, email, "passwordHash", role, "createdAt")
        VALUES (${adminId}, ${"Admin"}, ${"admin@neoboard.local"}, ${hash}, ${"admin"}, NOW())
      `;
    } else {
      adminId = users[0].id;
      console.log(`    Using existing user ${adminId}`);
    }

    // `--reset` short-circuits: delete showcase dashboards + drop demo schema.
    if (args.reset) {
      await resetDemo(sql, adminId);
      console.log("    Demo reset complete.");
      return;
    }

    // 2. Create connectors (idempotent by name)
    // Connection URIs default to localhost (dev). Override via env for Docker.
    const neo4jHost = process.env.NEO4J_HOST ?? "localhost";
    const pgHost = process.env.PG_HOST ?? "localhost";
    const neo4jConfig = {
      uri: `bolt://${neo4jHost}:7687`,
      username: "neo4j",
      password: "neoboard123",
      database: "neo4j",
    };
    const pgConfig = {
      uri: `postgresql://${pgHost}:5432`,
      username: "neoboard",
      password: "neoboard",
      database: "movies",
    };

    const neo4jConnId = await upsertConnector(
      sql,
      adminId,
      "Neo4j Movies",
      "neo4j",
      neo4jConfig,
      encryptionKey
    );
    const pgConnId = await upsertConnector(
      sql,
      adminId,
      "PostgreSQL Movies",
      "postgresql",
      pgConfig,
      encryptionKey
    );

    // Demo e-commerce connections — point at the isolated
    // `neoboard_demo_public` schema on the same Postgres instance.
    const ecommerceConfig = {
      uri: `postgresql://${pgHost}:5432`,
      username: "neoboard",
      password: "neoboard",
      database: "neoboard",
      schema: "neoboard_demo_public",
    };
    const ecommerceReadConnId = await upsertConnector(
      sql,
      adminId,
      "PostgreSQL Ecommerce (demo, read)",
      "postgresql",
      ecommerceConfig,
      encryptionKey,
    );
    const ecommerceWriteConnId = await upsertConnector(
      sql,
      adminId,
      "PostgreSQL Ecommerce (demo, write)",
      "postgresql",
      ecommerceConfig,
      encryptionKey,
    );

    console.log(`    Neo4j connector:      ${neo4jConnId}`);
    console.log(`    PostgreSQL connector:  ${pgConnId}`);
    console.log(`    Ecommerce (read):      ${ecommerceReadConnId}`);
    console.log(`    Ecommerce (write):     ${ecommerceWriteConnId}`);

    // 2a. Recreate the demo e-commerce schema + deterministic data
    await recreateEcommerceSchema(sql);
    await seedEcommerceData(sql);

    // 3. Create dashboards (idempotent by name)
    // Patch grid layout IDs to match widget IDs
    const showcaseLayout = buildWidgetShowcase(neo4jConnId, pgConnId);
    patchGridIds(showcaseLayout);
    await upsertDashboard(
      sql,
      adminId,
      "Widget Showcase",
      "All chart types: simple, rule-based styling, click actions, color palettes, and accessibility.",
      showcaseLayout,
      true
    );

    const paramLayout = buildParameterTesting(neo4jConnId, pgConnId);
    patchGridIds(paramLayout);
    await upsertDashboard(
      sql,
      adminId,
      "Parameter Testing",
      "One page per parameter type per connector, with bound data widgets.",
      paramLayout,
      true
    );

    const formLayout = buildFormTesting(neo4jConnId, pgConnId);
    patchGridIds(formLayout);
    await upsertDashboard(
      sql,
      adminId,
      "Form Testing",
      "Form widgets for Neo4j (CREATE) and PostgreSQL (INSERT) with companion data tables.",
      formLayout,
      true
    );

    const clickLayout = buildClickActionDemo(neo4jConnId, pgConnId);
    patchGridIds(clickLayout);
    await upsertDashboard(
      sql,
      adminId,
      "Click Actions",
      "Cell-click, bar-click, page navigation, and multi-rule table actions. All rules are editable and deletable.",
      clickLayout,
      true
    );

    const stylingLayout = buildStylingRulesDemo(neo4jConnId, pgConnId);
    patchGridIds(stylingLayout);
    await upsertDashboard(
      sql,
      adminId,
      "Styling Rules",
      "Rule-based styling with operators, parameter comparison, and multi-target support on bar, line, pie, single-value, and table charts.",
      stylingLayout,
      true
    );

    const catalogLayout = buildChartCatalog(neo4jConnId);
    patchGridIds(catalogLayout);
    await upsertDashboard(
      sql,
      adminId,
      "Chart Catalog",
      "One page per chart type. Each page shows every palette, feature variant, rule-based styling, click actions, and accessibility modes.",
      catalogLayout,
      true
    );

    const improvementsLayout = buildChartImprovements(neo4jConnId);
    patchGridIds(improvementsLayout);
    await upsertDashboard(
      sql,
      adminId,
      "Chart Improvements",
      "Number formatting, DataZoom, reference lines, axis rotation, donut/top-N pie, click enrichment, radar global scale, graph anti-clump, markdown tables.",
      improvementsLayout,
      true
    );

    const tableLayout = buildTableFeatures(neo4jConnId, pgConnId);
    patchGridIds(tableLayout);
    await upsertDashboard(
      sql,
      adminId,
      "Table Features",
      "Column resizing, row grouping with nested headers, conditional formatting (numeric, string, null), color scales, icons, and all features combined.",
      tableLayout,
      true
    );

    const transformLayout = buildTransformPlayground(neo4jConnId);
    patchGridIds(transformLayout);
    await upsertDashboard(
      sql,
      adminId,
      "Transform Playground",
      "Test data transforms: filter, sort, groupBy, calculatedColumn, rename, limit — with live preview.",
      transformLayout,
      true
    );

    console.log("    Demo dashboards seeded.");

    // 4. Showcase JSON import
    const connectionMap = {
      conn_neo4j: neo4jConnId,
      conn_postgres_read: ecommerceReadConnId,
      conn_postgres_write: ecommerceWriteConnId,
    };
    const targets = onlyKeys
      ? SHOWCASES.filter((s) => onlyKeys.includes(s.key))
      : SHOWCASES;
    for (const showcase of targets) {
      try {
        await importShowcase({
          jsonPath: showcase.jsonPath,
          adminId,
          connectionMap,
          upsertDashboard,
          patchGridIds,
          sql,
        });
        console.log(`    Showcase "${showcase.label}" imported.`);
      } catch (err) {
        console.error(
          `    Failed to import ${showcase.key}: ${err.message}`,
        );
        throw err;
      }
    }
  } finally {
    await sql.end();
  }
}

export function buildStylingRulesDemo(neo4jConnId, pgConnId) {
  // Reusable styling configs for different chart types
  const countStyling = {
    enabled: true,
    rules: [
      { id: uuid(), operator: "<=", value: 2, color: "#ef4444", target: "color" },
      { id: uuid(), operator: "<=", value: 5, color: "#f59e0b", target: "color" },
      { id: uuid(), operator: "<=", value: 10, color: "#22c55e", target: "color" },
    ],
  };
  const movieCountStyling = {
    enabled: true,
    rules: [
      { id: uuid(), operator: "<=", value: 20, color: "#ef4444", target: "color" },
      { id: uuid(), operator: "<=", value: 30, color: "#f59e0b", target: "color" },
      { id: uuid(), operator: "<=", value: 50, color: "#22c55e", target: "color" },
    ],
  };
  const peopleCountStyling = {
    enabled: true,
    rules: [
      { id: uuid(), operator: "<=", value: 50, color: "#ef4444", target: "backgroundColor" },
      { id: uuid(), operator: "<=", value: 100, color: "#f59e0b20", target: "backgroundColor" },
      { id: uuid(), operator: "<=", value: 200, color: "#22c55e20", target: "backgroundColor" },
    ],
  };
  const yearStyling = {
    enabled: true,
    targetColumn: "released",
    rules: [
      { id: uuid(), operator: "<=", value: 1995, color: "#3b82f620", target: "backgroundColor" },
      { id: uuid(), operator: "<=", value: 2000, color: "#22c55e20", target: "backgroundColor" },
      { id: uuid(), operator: "<=", value: 2010, color: "#f59e0b20", target: "backgroundColor" },
    ],
  };

  return {
    version: 2,
    pages: [
      // ── Page 1: Neo4j — Styling Rules ──
      {
        id: uuid(),
        title: "Neo4j — Styling Rules",
        widgets: [
          {
            id: uuid(),
            chartType: "bar",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade",
            settings: {
              title: "Movies by Decade (bar colors by count)",
              stylingConfig: countStyling,
            },
          },
          {
            id: uuid(),
            chartType: "line",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN m.released AS year, count(*) AS count ORDER BY year",
            settings: {
              title: "Releases Over Time (line color by last value)",
              chartOptions: { showPoints: true },
              stylingConfig: countStyling,
            },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count",
            settings: {
              title: "Relationship Types (slice colors by count)",
              stylingConfig: countStyling,
            },
          },
          {
            id: uuid(),
            chartType: "single-value",
            connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN count(m) AS value",
            settings: {
              title: "Total Movies",
              stylingConfig: movieCountStyling,
            },
          },
          {
            id: uuid(),
            chartType: "single-value",
            connectionId: neo4jConnId,
            query: "MATCH (p:Person) RETURN count(p) AS value",
            settings: {
              title: "Total People (background color)",
              stylingConfig: peopleCountStyling,
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie) RETURN m.title AS title, m.released AS released, m.tagline AS tagline ORDER BY m.released DESC",
            settings: {
              title: "Movies (row color by release year)",
              stylingConfig: yearStyling,
            },
          },
        ],
        gridLayout: [
          // Row 1: bar + line
          { i: null, x: 0, y: 0, w: 6, h: 4 },
          { i: null, x: 6, y: 0, w: 6, h: 4 },
          // Row 2: pie + 2 single-values
          { i: null, x: 0, y: 4, w: 4, h: 4 },
          { i: null, x: 4, y: 4, w: 4, h: 2 },
          { i: null, x: 8, y: 4, w: 4, h: 2 },
          // Row 3: table
          { i: null, x: 0, y: 8, w: 12, h: 4 },
        ],
      },

      // ── Page 2: PostgreSQL — Styling Rules ──
      {
        id: uuid(),
        title: "PostgreSQL — Styling Rules",
        widgets: [
          {
            id: uuid(),
            chartType: "bar",
            connectionId: pgConnId,
            query:
              "SELECT (released / 10) * 10 AS decade, count(*) AS count FROM movies GROUP BY decade ORDER BY decade",
            settings: {
              title: "Movies by Decade (bar colors by count)",
              stylingConfig: countStyling,
            },
          },
          {
            id: uuid(),
            chartType: "line",
            connectionId: pgConnId,
            query:
              "SELECT released AS year, count(*) AS count FROM movies GROUP BY released ORDER BY released",
            settings: {
              title: "Releases Over Time (line color by last value)",
              chartOptions: { showPoints: true },
              stylingConfig: countStyling,
            },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: pgConnId,
            query:
              "SELECT relationship AS type, count(*) AS count FROM roles GROUP BY relationship",
            settings: {
              title: "Roles Distribution (slice colors by count)",
              stylingConfig: countStyling,
            },
          },
          {
            id: uuid(),
            chartType: "single-value",
            connectionId: pgConnId,
            query: "SELECT count(*) AS value FROM movies",
            settings: {
              title: "Total Movies",
              stylingConfig: movieCountStyling,
            },
          },
          {
            id: uuid(),
            chartType: "single-value",
            connectionId: pgConnId,
            query: "SELECT count(*) AS value FROM people",
            settings: {
              title: "Total People (background color)",
              stylingConfig: peopleCountStyling,
            },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT m.title, m.released, m.tagline FROM movies m ORDER BY m.released DESC",
            settings: {
              title: "Movies (row color by release year)",
              stylingConfig: yearStyling,
            },
          },
        ],
        gridLayout: [
          // Row 1: bar + line
          { i: null, x: 0, y: 0, w: 6, h: 4 },
          { i: null, x: 6, y: 0, w: 6, h: 4 },
          // Row 2: pie + 2 single-values
          { i: null, x: 0, y: 4, w: 4, h: 4 },
          { i: null, x: 4, y: 4, w: 4, h: 2 },
          { i: null, x: 8, y: 4, w: 4, h: 2 },
          // Row 3: table
          { i: null, x: 0, y: 8, w: 12, h: 4 },
        ],
      },
    ],
  };
}

// ─── Chart Improvements — dedicated dashboard for new features ──────
export function buildChartImprovements(neo4jConnId) {
  return {
    version: 2,
    pages: [
      // ── Page 1: Number Formatting ──
      {
        id: uuid(),
        title: "Number Formatting",
        widgets: [
          {
            id: uuid(), chartType: "single-value", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN count(m) * 12345 AS value",
            settings: { title: "Plain (default)", chartOptions: { fontSize: "lg" } },
          },
          {
            id: uuid(), chartType: "single-value", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN count(m) * 12345 AS value",
            settings: { title: "Comma + prefix/suffix", chartOptions: { numberFormat: "comma", prefix: "$", suffix: " USD", decimalPlaces: 2, fontSize: "lg" } },
          },
          {
            id: uuid(), chartType: "single-value", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN count(m) * 12345 AS value",
            settings: { title: "Compact notation", chartOptions: { numberFormat: "compact", decimalPlaces: 1, fontSize: "lg" } },
          },
          {
            id: uuid(), chartType: "single-value", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN 87.654 AS value",
            settings: { title: "Percent format", chartOptions: { numberFormat: "percent", decimalPlaces: 1, fontSize: "lg" } },
          },
          {
            id: uuid(), chartType: "bar", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade",
            settings: { title: "Bar — tooltip decimal places = 2", chartOptions: { decimalPlaces: 2, xAxisLabel: "Decade", yAxisLabel: "Count" } },
          },
          {
            id: uuid(), chartType: "line", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN m.released AS year, count(*) AS count ORDER BY year",
            settings: { title: "Line — tooltip decimal places = 1", chartOptions: { decimalPlaces: 1, showPoints: true } },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 3, h: 2 },
          { i: null, x: 3, y: 0, w: 3, h: 2 },
          { i: null, x: 6, y: 0, w: 3, h: 2 },
          { i: null, x: 9, y: 0, w: 3, h: 2 },
          { i: null, x: 0, y: 2, w: 6, h: 4 },
          { i: null, x: 6, y: 2, w: 6, h: 4 },
        ],
      },

      // ── Page 2: DataZoom + Reference Lines ──
      {
        id: uuid(),
        title: "DataZoom + Reference Lines",
        widgets: [
          {
            id: uuid(), chartType: "bar", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS name, count(m) AS movies ORDER BY movies DESC RETURN name, movies LIMIT 20",
            settings: { title: "Bar — scroll to zoom + 2 reference lines", chartOptions: {
              enableDataZoom: true, xAxisLabel: "Actor", yAxisLabel: "Movies",
              referenceLines: JSON.stringify([{ value: 3, label: "Average", color: "#f59e0b" }, { value: 5, label: "Prolific", color: "#22c55e" }]),
            } },
          },
          {
            id: uuid(), chartType: "line", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN m.released AS year, count(*) AS count ORDER BY year",
            settings: { title: "Line — scroll to zoom + target line", chartOptions: {
              enableDataZoom: true, showPoints: true, xAxisLabel: "Year", yAxisLabel: "Releases",
              referenceLines: JSON.stringify([{ value: 5, label: "Target", color: "#ef4444" }]),
            } },
          },
          {
            id: uuid(), chartType: "bar", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade",
            settings: { title: "Bar — no DataZoom (control)", chartOptions: { xAxisLabel: "Decade", yAxisLabel: "Count" } },
          },
          {
            id: uuid(), chartType: "line", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN m.released AS year, count(*) AS count ORDER BY year",
            settings: { title: "Line — reference line only (no zoom)", chartOptions: {
              smooth: true, area: true,
              referenceLines: JSON.stringify([{ value: 3, label: "Threshold", color: "#8b5cf6" }]),
            } },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 5 },
          { i: null, x: 6, y: 0, w: 6, h: 5 },
          { i: null, x: 0, y: 5, w: 6, h: 5 },
          { i: null, x: 6, y: 5, w: 6, h: 5 },
        ],
      },

      // ── Page 3: Axis Labels + Rotation ──
      {
        id: uuid(),
        title: "Axis Labels",
        widgets: [
          {
            id: uuid(), chartType: "bar", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN m.title AS label, m.released AS value ORDER BY m.released LIMIT 15",
            settings: { title: "Auto-rotate (15 items)" },
          },
          {
            id: uuid(), chartType: "bar", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS name, count(m) AS movies ORDER BY movies DESC RETURN name AS label, movies AS value LIMIT 20",
            settings: { title: "Forced 45\u00b0 rotation", chartOptions: { axisLabelRotation: 45, xAxisLabel: "Actor Name", yAxisLabel: "Movie Count" } },
          },
          {
            id: uuid(), chartType: "bar", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS name, count(m) AS movies ORDER BY movies DESC RETURN name AS label, movies AS value LIMIT 10",
            settings: { title: "Forced 90\u00b0 rotation", chartOptions: { axisLabelRotation: 90 } },
          },
          {
            id: uuid(), chartType: "bar", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade",
            settings: { title: "No rotation needed (few items)" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 5 },
          { i: null, x: 6, y: 0, w: 6, h: 5 },
          { i: null, x: 0, y: 5, w: 6, h: 5 },
          { i: null, x: 6, y: 5, w: 6, h: 5 },
        ],
      },

      // ── Page 4: Pie Donut + Top-N ──
      {
        id: uuid(),
        title: "Pie Donut + Top-N",
        widgets: [
          {
            id: uuid(), chartType: "pie", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS name, count(m) AS value ORDER BY value DESC RETURN name, value LIMIT 15",
            settings: { title: "Standard pie (all 15 slices)" },
          },
          {
            id: uuid(), chartType: "pie", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS name, count(m) AS value ORDER BY value DESC RETURN name, value LIMIT 15",
            settings: { title: "Donut mode", chartOptions: { donut: true } },
          },
          {
            id: uuid(), chartType: "pie", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS name, count(m) AS value ORDER BY value DESC RETURN name, value LIMIT 15",
            settings: { title: "Donut + Top 5 + center text", chartOptions: { donut: true, topN: 5, donutCenterText: "Top Actors", showPercentage: true } },
          },
          {
            id: uuid(), chartType: "pie", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS name, count(m) AS value ORDER BY value DESC RETURN name, value LIMIT 15",
            settings: { title: "Top 3 only (rest grouped as Other)", chartOptions: { topN: 3, showPercentage: true, sortSlices: true } },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 5 },
          { i: null, x: 6, y: 0, w: 6, h: 5 },
          { i: null, x: 0, y: 5, w: 6, h: 5 },
          { i: null, x: 6, y: 5, w: 6, h: 5 },
        ],
      },

      // ── Page 5: Click Action Row Enrichment ──
      {
        id: uuid(),
        title: "Click Action Enrichment",
        widgets: [
          {
            id: uuid(), chartType: "table", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN m.title AS title, m.released AS released, m.tagline AS tagline ORDER BY m.released DESC LIMIT 10",
            settings: {
              title: "Click a row \u2192 tagline fills below",
              clickAction: {
                type: "set-parameter",
                rules: [{
                  id: uuid(), type: "set-parameter", triggerColumn: "title",
                  parameterMapping: { parameterName: "clicked_tagline", sourceField: "tagline" },
                }],
              },
            },
          },
          {
            id: uuid(), chartType: "parameter-select", connectionId: "", query: "",
            settings: { title: "Clicked Tagline", chartOptions: { parameterType: "text", parameterName: "clicked_tagline" } },
          },
          {
            id: uuid(), chartType: "table", connectionId: neo4jConnId,
            query: "MATCH (m:Movie) RETURN m.title AS title, m.released AS released, m.tagline AS tagline ORDER BY m.released DESC LIMIT 10",
            settings: { title: "Reference table (verify tagline matches)" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 8, h: 5 },
          { i: null, x: 8, y: 0, w: 4, h: 2 },
          { i: null, x: 0, y: 5, w: 12, h: 4 },
        ],
      },

      // ── Page 6: Radar Global Scale + Graph Anti-Clump + Markdown Table ──
      {
        id: uuid(),
        title: "Radar, Graph, Markdown",
        widgets: [
          {
            id: uuid(), chartType: "radar", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS indicator, count(*) AS value RETURN indicator, value",
            settings: { title: "Radar \u2014 global scale (magnitudes visible)", chartOptions: { filled: true, shape: "polygon" } },
          },
          {
            id: uuid(), chartType: "graph", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[r]->(m:Movie) RETURN p, r, m LIMIT 25",
            settings: { title: "Graph \u2014 anti-clumping layout", chartOptions: { showLabels: true } },
          },
          {
            id: uuid(), chartType: "markdown", connectionId: "", query: "",
            settings: { title: "Markdown table rendering", chartOptions: {
              content: [
                "## Chart Improvements Checklist",
                "",
                "| # | Feature | Chart Type | What to Check |",
                "|---|---|---|---|",
                "| 1 | Number Format | Single Value | comma, compact, percent, decimal places |",
                "| 2 | Tooltip Decimals | Bar, Line | Hover tooltip shows fixed decimals |",
                "| 3 | DataZoom | Bar, Line | Scroll-zoom on axes |",
                "| 4 | Reference Lines | Bar, Line | Dashed horizontal lines with labels |",
                "| 5 | Axis Rotation | Bar | Auto-rotate at 8+ items, manual override |",
                "| 6 | Donut Mode | Pie | Hole in center with text |",
                "| 7 | Top-N Grouping | Pie | Extra slices grouped as Other |",
                "| 8 | Click Enrichment | All | Non-axis columns available in click data |",
                "| 9 | Radar Scale | Radar | Single global max, not per-indicator |",
                "| 10 | Graph Layout | Graph | Nodes spread out, no clumping |",
                "| 11 | Markdown Table | Markdown | This table renders correctly |",
                "| 12 | A11y (ARIA) | All ECharts | role=img, aria-label, tabIndex=0 |",
              ].join("\n"),
            } },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 5 },
          { i: null, x: 6, y: 0, w: 6, h: 5 },
          { i: null, x: 0, y: 5, w: 12, h: 5 },
        ],
      },
    ],
  };
}

// ─── Table Features — column resize, conditional formatting, row grouping ──
export function buildTableFeatures(neo4jConnId, pgConnId) {
  return {
    version: 2,
    pages: [
      // ── Page 1: Column Resizing ──
      {
        id: uuid(),
        title: "Column Resizing",
        widgets: [
          {
            id: uuid(), chartType: "table", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p.name AS actor, m.title AS movie, m.released AS year, m.tagline AS tagline ORDER BY year DESC LIMIT 30",
            settings: { title: "Drag column borders to resize (Neo4j)", chartOptions: { enableColumnResizing: true, enableSorting: true, enablePagination: true, pageSize: 10 } },
          },
          {
            id: uuid(), chartType: "table", connectionId: pgConnId,
            query: "SELECT title, released, tagline FROM movies ORDER BY released DESC LIMIT 30",
            settings: { title: "Drag column borders to resize (PostgreSQL)", chartOptions: { enableColumnResizing: true, enableSorting: true, enablePagination: true, pageSize: 10 } },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 12, h: 5 },
          { i: null, x: 0, y: 5, w: 12, h: 5 },
        ],
      },

      // ── Page 2: Row Grouping ──
      {
        id: uuid(),
        title: "Row Grouping",
        widgets: [
          {
            id: uuid(), chartType: "table", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS relationship, m.title AS movie, p.name AS person, m.released AS year ORDER BY relationship, movie",
            settings: { title: "Group by relationship type", chartOptions: { enableGrouping: true, groupBy: "relationship", enableSorting: true, enablePagination: true, pageSize: 15 } },
          },
          {
            id: uuid(), chartType: "table", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS relationship, (m.released / 10) * 10 AS decade, m.title AS movie, p.name AS person ORDER BY relationship, decade",
            settings: { title: "Nested grouping: relationship > decade", chartOptions: { enableGrouping: true, groupBy: "relationship,decade", enableSorting: true, enablePagination: true, pageSize: 20 } },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 12, h: 6 },
          { i: null, x: 0, y: 6, w: 12, h: 6 },
        ],
      },

      // ── Page 3: Rule-Based Styling — Numeric Rules ──
      {
        id: uuid(),
        title: "Rule-Based Styling",
        widgets: [
          {
            id: uuid(), chartType: "table", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS actor, count(m) AS movies, min(m.released) AS first_role, max(m.released) AS last_role RETURN actor, movies, first_role, last_role ORDER BY movies DESC",
            settings: {
              title: "Numeric rules: bg color + bold",
              chartOptions: { enableSorting: true, enableColumnResizing: true, enablePagination: true, pageSize: 15 },
              stylingConfig: {
                enabled: true,
                rules: [
                  { id: uuid(), column: "movies", operator: ">=", value: 4, color: "#dcfce7", target: "backgroundColor", bold: true },
                  { id: uuid(), column: "movies", operator: "<=", value: 1, color: "#fee2e2", target: "backgroundColor" },
                  { id: uuid(), column: "movies", operator: "between", value: 2, valueTo: 3, color: "#fef3c7", target: "backgroundColor" },
                ],
              },
            },
          },
          {
            id: uuid(), chartType: "table", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS actor, count(m) AS movies, min(m.released) AS first_role, max(m.released) AS last_role RETURN actor, movies, first_role, last_role ORDER BY movies DESC",
            settings: {
              title: "Color scale: movies (red\u2192green), first_role (blue\u2192red)",
              chartOptions: { enableSorting: true, enableColumnResizing: true, enablePagination: true, pageSize: 15 },
              conditionalFormatting: {
                colorScales: [
                  { column: "movies", minColor: "#ef4444", maxColor: "#22c55e" },
                  { column: "first_role", minColor: "#3b82f6", maxColor: "#ef4444" },
                ],
              },
            },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 12, h: 6 },
          { i: null, x: 0, y: 6, w: 12, h: 6 },
        ],
      },

      // ── Page 4: Rule-Based Styling — String Rules ──
      {
        id: uuid(),
        title: "String & Null Rules",
        widgets: [
          {
            id: uuid(), chartType: "table", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[r]->(m:Movie) RETURN p.name AS person, type(r) AS role, m.title AS movie, m.tagline AS tagline ORDER BY person LIMIT 40",
            settings: {
              title: "String operators: contains, starts_with, is_null",
              chartOptions: { enableSorting: true, enableColumnResizing: true, enablePagination: true, pageSize: 15 },
              stylingConfig: {
                enabled: true,
                rules: [
                  { id: uuid(), column: "role", operator: "==", value: "DIRECTED", color: "#dbeafe", target: "backgroundColor", bold: true },
                  { id: uuid(), column: "role", operator: "==", value: "ACTED_IN", color: "#f0fdf4", target: "backgroundColor" },
                  { id: uuid(), column: "role", operator: "==", value: "PRODUCED", color: "#fef3c7", target: "backgroundColor" },
                  { id: uuid(), column: "person", operator: "starts_with", value: "Tom", color: "#e0e7ff", target: "backgroundColor", bold: true },
                  { id: uuid(), column: "tagline", operator: "is_null", value: "", color: "#f3f4f6", target: "backgroundColor" },
                ],
              },
            },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 12, h: 8 },
        ],
      },

      // ── Page 5: All Features Combined ──
      {
        id: uuid(),
        title: "All Features Combined",
        widgets: [
          {
            id: uuid(), chartType: "table", connectionId: neo4jConnId,
            query: "MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS role, p.name AS person, count(m) AS movies, min(m.released) AS since RETURN role, person, movies, since ORDER BY role, movies DESC",
            settings: {
              title: "Grouping + resize + styling rules + color scale",
              chartOptions: {
                enableColumnResizing: true,
                enableSorting: true,
                enableGrouping: true,
                groupBy: "role",
                enablePagination: true,
                pageSize: 20,
              },
              stylingConfig: {
                enabled: true,
                rules: [
                  { id: uuid(), column: "movies", operator: ">=", value: 4, color: "#dcfce7", target: "backgroundColor", bold: true },
                  { id: uuid(), column: "movies", operator: "==", value: 1, color: "#9ca3af", target: "textColor" },
                ],
              },
              conditionalFormatting: {
                colorScales: [
                  { column: "since", minColor: "#3b82f6", maxColor: "#f97316" },
                ],
              },
            },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 12, h: 10 },
        ],
      },
    ],
  };
}

/** Set gridLayout[n].i = widgets[n].id for each page. */
// ─── Chart Catalog — comprehensive per-chart-type showcase ──────────
export function buildChartCatalog(neo4jId) {
  const P = ["deep-ocean", "warm-sunset", "cool-breeze", "earth-tones", "neon", "monochrome"];
  const detailPageId = uuid();
  const behaviorPageId = uuid();

  // Reusable queries (Neo4j movie dataset)
  const Q = {
    barData: "MATCH (m:Movie) RETURN (m.released / 10) * 10 AS label, count(*) AS count ORDER BY label",
    barMulti: "MATCH (p:Person)-[r]->(m:Movie) WITH (m.released / 10) * 10 AS decade, type(r) AS rel, count(*) AS cnt RETURN decade AS label, rel, cnt ORDER BY decade",
    lineData: "MATCH (m:Movie) RETURN m.released AS x, count(*) AS count ORDER BY x",
    pieData: "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
    singleVal: "MATCH (m:Movie) RETURN count(m) AS value",
    singleTrend: "MATCH (m:Movie) RETURN count(m) AS value, count(m) - 5 AS previous",
    tableData: "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p.name AS name, m.title AS movie, m.released AS year ORDER BY year DESC LIMIT 30",
    gaugeData: "MATCH (m:Movie) RETURN count(m) AS value, 'Movies' AS name",
    radarData: "MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS indicator, count(*) AS value RETURN indicator, value",
    sankeyData: "MATCH (p:Person)-[r]->(m:Movie) WHERE type(r) IN ['ACTED_IN','DIRECTED'] WITH p.name AS source, m.title AS target, 1 AS value RETURN source, target, value LIMIT 20",
    sunburstData: "MATCH ()-[r]->() WITH type(r) AS relType, count(*) AS cnt RETURN '' AS parent, relType AS name, cnt AS value UNION ALL MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS relType, m.title AS movie, count(p) AS cnt RETURN relType AS parent, movie AS name, cnt AS value LIMIT 30",
    treemapData: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH m, count(p) AS cast RETURN m.title AS name, cast AS value ORDER BY cast DESC LIMIT 15",
    graphData: "MATCH (p:Person)-[r]->(m:Movie) RETURN p, r, m LIMIT 15",
    graphSmall: "MATCH (p:Person)-[r:DIRECTED]->(m:Movie) RETURN p, r, m LIMIT 10",
    selectSeed: "MATCH (p:Person) RETURN DISTINCT p.name AS value, p.name AS label ORDER BY p.name LIMIT 20",
    mapCities: "MATCH (c:City) RETURN c.name AS name, c.latitude AS lat, c.longitude AS lng, c.population AS value",
    mapFilming: "MATCH (m:Movie)-[:FILMED_IN]->(c:City) RETURN c.name AS name, c.latitude AS lat, c.longitude AS lng, count(m) AS value",
    mapBirthplaces: "MATCH (p:Person)-[:BORN_IN]->(c:City) RETURN c.name AS name, c.latitude AS lat, c.longitude AS lng, count(p) AS value, collect(p.name)[0..3] AS people",
  };

  // Styling rules reusable across pages
  const barStyling = {
    enabled: true,
    rules: [
      { id: uuid(), operator: "<=", value: 5, color: "#ef4444", target: "color" },
      { id: uuid(), operator: ">=", value: 15, color: "#22c55e", target: "color" },
    ],
  };
  const singleValueStyling = {
    enabled: true,
    rules: [
      { id: uuid(), operator: "<", value: 20, color: "#ef4444", target: "color" },
      { id: uuid(), operator: ">=", value: 20, color: "#22c55e", target: "color" },
      { id: uuid(), operator: ">=", value: 20, color: "#dcfce7", target: "backgroundColor" },
    ],
  };

  // Click action: set parameter on click
  const clickSetParam = (triggerCol, paramName) => ({
    type: "set-parameter",
    rules: [{
      id: uuid(), type: "set-parameter",
      triggerColumn: triggerCol,
      parameterMapping: { parameterName: paramName, sourceField: triggerCol },
    }],
  });

  // Click action: navigate to page
  const clickNavPage = (triggerCol, pageId) => ({
    type: "navigate-to-page",
    rules: [{
      id: uuid(), type: "navigate-to-page",
      triggerColumn: triggerCol,
      targetPageId: pageId,
    }],
  });

  // Helper to make a palette row of widgets for a given chart type
  function paletteRow(chartType, query, baseSettings = {}) {
    return P.map((p) => ({
      id: uuid(),
      chartType,
      connectionId: neo4jId,
      query,
      settings: { ...baseSettings, title: p, chartOptions: { ...baseSettings.chartOptions, colorPalette: p } },
    }));
  }

  function paletteGrid(yStart = 0) {
    // 3×2 grid for 6 palettes, each 4×4
    return P.map((_, i) => ({
      i: null,
      x: (i % 3) * 4,
      y: yStart + Math.floor(i / 3) * 4,
      w: 4,
      h: 4,
    }));
  }

  return {
    version: 2,
    pages: [
      // ── Page 1: Bar Chart ──────────────────────────────────────────
      {
        id: uuid(),
        title: "Bar Chart",
        widgets: [
          // Vertical bar (default)
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "Vertical (default)" } },
          // Horizontal bar
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "Horizontal", chartOptions: { orientation: "horizontal" } } },
          // Grouped (multi-series, side-by-side)
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barMulti,
            settings: { title: "Grouped (multi-series)", chartOptions: { showLegend: true } } },
          // Stacked bar
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barMulti,
            settings: { title: "Stacked", chartOptions: { stacked: true } } },
          // Bar with values shown
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "Show Values", chartOptions: { showValues: true } } },
          // Bar with styling rules
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "Rule-Based Styling", stylingConfig: barStyling } },
          // Bar with click action
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "Click → Set Parameter", clickAction: clickSetParam("label", "bar_decade") } },
          // Bar with colorblind mode
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "Colorblind Mode", chartOptions: { colorblindMode: true } } },
          // 6 palette variants
          ...paletteRow("bar", Q.barData),
        ],
        gridLayout: [
          // Row 1: vertical, horizontal, grouped, stacked (3×4 each)
          { i: null, x: 0, y: 0, w: 3, h: 4 },
          { i: null, x: 3, y: 0, w: 3, h: 4 },
          { i: null, x: 6, y: 0, w: 3, h: 4 },
          { i: null, x: 9, y: 0, w: 3, h: 4 },
          // Row 2: show values, styling, click, accessibility (3×4 each)
          { i: null, x: 0, y: 4, w: 3, h: 4 },
          { i: null, x: 3, y: 4, w: 3, h: 4 },
          { i: null, x: 6, y: 4, w: 3, h: 4 },
          { i: null, x: 9, y: 4, w: 3, h: 4 },
          // Rows 3-4: palette grid
          ...paletteGrid(8),
        ],
      },

      // ── Page 2: Line Chart ─────────────────────────────────────────
      {
        id: uuid(),
        title: "Line Chart",
        widgets: [
          { id: uuid(), chartType: "line", connectionId: neo4jId, query: Q.lineData,
            settings: { title: "Default" } },
          { id: uuid(), chartType: "line", connectionId: neo4jId, query: Q.lineData,
            settings: { title: "Smooth + Area", chartOptions: { smooth: true, area: true } } },
          { id: uuid(), chartType: "line", connectionId: neo4jId, query: Q.lineData,
            settings: { title: "Stepped", chartOptions: { stepped: true } } },
          { id: uuid(), chartType: "line", connectionId: neo4jId, query: Q.lineData,
            settings: { title: "Show Points", chartOptions: { showPoints: true, lineWidth: 3 } } },
          { id: uuid(), chartType: "line", connectionId: neo4jId, query: Q.lineData,
            settings: { title: "Colorblind Mode", chartOptions: { colorblindMode: true, area: true } } },
          ...paletteRow("line", Q.lineData),
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 3, h: 4 },
          { i: null, x: 3, y: 0, w: 3, h: 4 },
          { i: null, x: 6, y: 0, w: 3, h: 4 },
          { i: null, x: 9, y: 0, w: 3, h: 4 },
          { i: null, x: 0, y: 4, w: 4, h: 4 },
          ...paletteGrid(8),
        ],
      },

      // ── Page 3: Pie Chart ──────────────────────────────────────────
      {
        id: uuid(),
        title: "Pie Chart",
        widgets: [
          { id: uuid(), chartType: "pie", connectionId: neo4jId, query: Q.pieData,
            settings: { title: "Default Pie" } },
          { id: uuid(), chartType: "pie", connectionId: neo4jId, query: Q.pieData,
            settings: { title: "Donut", chartOptions: { donut: true } } },
          { id: uuid(), chartType: "pie", connectionId: neo4jId, query: Q.pieData,
            settings: { title: "Rose / Nightingale", chartOptions: { roseMode: true } } },
          { id: uuid(), chartType: "pie", connectionId: neo4jId, query: Q.pieData,
            settings: { title: "Labels Inside", chartOptions: { labelPosition: "inside" } } },
          { id: uuid(), chartType: "pie", connectionId: neo4jId, query: Q.pieData,
            settings: { title: "Click → Set Param", clickAction: clickSetParam("name", "pie_type") } },
          { id: uuid(), chartType: "pie", connectionId: neo4jId, query: Q.pieData,
            settings: { title: "Colorblind Mode", chartOptions: { colorblindMode: true } } },
          ...paletteRow("pie", Q.pieData),
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 4 },
          { i: null, x: 4, y: 0, w: 4, h: 4 },
          { i: null, x: 8, y: 0, w: 4, h: 4 },
          { i: null, x: 0, y: 4, w: 4, h: 4 },
          { i: null, x: 4, y: 4, w: 4, h: 4 },
          { i: null, x: 8, y: 4, w: 4, h: 4 },
          ...paletteGrid(8),
        ],
      },

      // ── Page 4: Single Value ───────────────────────────────────────
      {
        id: uuid(),
        title: "Single Value",
        widgets: [
          { id: uuid(), chartType: "single-value", connectionId: neo4jId, query: Q.singleVal,
            settings: { title: "Default", chartOptions: { fontSize: "lg" } } },
          { id: uuid(), chartType: "single-value", connectionId: neo4jId, query: Q.singleVal,
            settings: { title: "With Prefix/Suffix", chartOptions: { prefix: "$", suffix: "M", fontSize: "xl" } } },
          { id: uuid(), chartType: "single-value", connectionId: neo4jId, query: Q.singleVal,
            settings: { title: "Comma Format", chartOptions: { numberFormat: "comma", fontSize: "lg" } } },
          { id: uuid(), chartType: "single-value", connectionId: neo4jId, query: Q.singleVal,
            settings: { title: "Compact Format", chartOptions: { numberFormat: "compact", fontSize: "lg" } } },
          { id: uuid(), chartType: "single-value", connectionId: neo4jId, query: Q.singleVal,
            settings: { title: "Rule-Based Styling", stylingConfig: singleValueStyling, chartOptions: { fontSize: "xl" } } },
          { id: uuid(), chartType: "single-value", connectionId: neo4jId,
            query: "MATCH (m:Movie) RETURN count(m) AS value, count(m) - 5 AS previous",
            settings: { title: "With Trend", chartOptions: { fontSize: "lg", trendEnabled: true } } },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 3 },
          { i: null, x: 4, y: 0, w: 4, h: 3 },
          { i: null, x: 8, y: 0, w: 4, h: 3 },
          { i: null, x: 0, y: 3, w: 4, h: 3 },
          { i: null, x: 4, y: 3, w: 4, h: 3 },
          { i: null, x: 8, y: 3, w: 4, h: 3 },
        ],
      },

      // ── Page 5: Table ──────────────────────────────────────────────
      {
        id: uuid(),
        title: "Table",
        widgets: [
          { id: uuid(), chartType: "table", connectionId: neo4jId, query: Q.tableData,
            settings: { title: "Default Table" } },
          { id: uuid(), chartType: "table", connectionId: neo4jId, query: Q.tableData,
            settings: { title: "With Sorting + Filters", chartOptions: { enableSorting: true, enableColumnFilters: true, enableGlobalFilter: true } } },
          { id: uuid(), chartType: "table", connectionId: neo4jId, query: Q.tableData,
            settings: { title: "Row Selection", chartOptions: { enableSelection: true } } },
          { id: uuid(), chartType: "table", connectionId: neo4jId, query: Q.tableData,
            settings: { title: "Click → Set Parameter", clickAction: clickSetParam("name", "table_actor") } },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 5 },
          { i: null, x: 6, y: 0, w: 6, h: 5 },
          { i: null, x: 0, y: 5, w: 6, h: 5 },
          { i: null, x: 6, y: 5, w: 6, h: 5 },
        ],
      },

      // ── Page 6: Gauge Chart ────────────────────────────────────────
      {
        id: uuid(),
        title: "Gauge Chart",
        widgets: [
          { id: uuid(), chartType: "gauge", connectionId: neo4jId, query: Q.gaugeData,
            settings: { title: "Default Gauge" } },
          { id: uuid(), chartType: "gauge", connectionId: neo4jId, query: Q.gaugeData,
            settings: { title: "No Pointer", chartOptions: { showPointer: false } } },
          { id: uuid(), chartType: "gauge", connectionId: neo4jId, query: Q.gaugeData,
            settings: { title: "Half Gauge", chartOptions: { startAngle: 180, endAngle: 0 } } },
          { id: uuid(), chartType: "gauge", connectionId: neo4jId, query: Q.gaugeData,
            settings: { title: "Rule-Based Styling", stylingConfig: singleValueStyling } },
          ...paletteRow("gauge", Q.gaugeData),
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 3, h: 4 },
          { i: null, x: 3, y: 0, w: 3, h: 4 },
          { i: null, x: 6, y: 0, w: 3, h: 4 },
          { i: null, x: 9, y: 0, w: 3, h: 4 },
          ...paletteGrid(4),
        ],
      },

      // ── Page 7: Radar Chart ────────────────────────────────────────
      {
        id: uuid(),
        title: "Radar Chart",
        widgets: [
          { id: uuid(), chartType: "radar", connectionId: neo4jId, query: Q.radarData,
            settings: { title: "Default Radar" } },
          { id: uuid(), chartType: "radar", connectionId: neo4jId, query: Q.radarData,
            settings: { title: "Circle Shape", chartOptions: { shape: "circle" } } },
          { id: uuid(), chartType: "radar", connectionId: neo4jId, query: Q.radarData,
            settings: { title: "Filled + Values", chartOptions: { filled: true, showValues: true } } },
          { id: uuid(), chartType: "radar", connectionId: neo4jId, query: Q.radarData,
            settings: { title: "Colorblind Mode", chartOptions: { colorblindMode: true } } },
          ...paletteRow("radar", Q.radarData),
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 3, h: 4 },
          { i: null, x: 3, y: 0, w: 3, h: 4 },
          { i: null, x: 6, y: 0, w: 3, h: 4 },
          { i: null, x: 9, y: 0, w: 3, h: 4 },
          ...paletteGrid(4),
        ],
      },

      // ── Page 8: Sankey Chart ───────────────────────────────────────
      {
        id: uuid(),
        title: "Sankey Chart",
        widgets: [
          { id: uuid(), chartType: "sankey", connectionId: neo4jId, query: Q.sankeyData,
            settings: { title: "Horizontal (default)" } },
          { id: uuid(), chartType: "sankey", connectionId: neo4jId, query: Q.sankeyData,
            settings: { title: "Vertical", chartOptions: { orient: "vertical" } } },
          ...paletteRow("sankey", Q.sankeyData),
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 5 },
          { i: null, x: 6, y: 0, w: 6, h: 5 },
          ...paletteGrid(5),
        ],
      },

      // ── Page 9: Treemap Chart ──────────────────────────────────────
      {
        id: uuid(),
        title: "Treemap Chart",
        widgets: [
          { id: uuid(), chartType: "treemap", connectionId: neo4jId, query: Q.treemapData,
            settings: { title: "Default Treemap" } },
          { id: uuid(), chartType: "treemap", connectionId: neo4jId, query: Q.treemapData,
            settings: { title: "With Values", chartOptions: { showValues: true } } },
          ...paletteRow("treemap", Q.treemapData),
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 5 },
          { i: null, x: 6, y: 0, w: 6, h: 5 },
          ...paletteGrid(5),
        ],
      },

      // ── Page 10: Sunburst Chart ────────────────────────────────────
      {
        id: uuid(),
        title: "Sunburst Chart",
        widgets: [
          { id: uuid(), chartType: "sunburst", connectionId: neo4jId, query: Q.sunburstData,
            settings: { title: "Default Sunburst" } },
          { id: uuid(), chartType: "sunburst", connectionId: neo4jId, query: Q.sunburstData,
            settings: { title: "No Labels", chartOptions: { showLabels: false } } },
          ...paletteRow("sunburst", Q.sunburstData),
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 5 },
          { i: null, x: 6, y: 0, w: 6, h: 5 },
          ...paletteGrid(5),
        ],
      },

      // ── Page 11: Content Widgets ───────────────────────────────────
      {
        id: uuid(),
        title: "Content Widgets",
        widgets: [
          { id: uuid(), chartType: "markdown", connectionId: "", query: "",
            settings: {
              title: "Markdown Widget",
              chartOptions: {
                content: "# NeoBoard Chart Catalog\n\nThis dashboard showcases **every chart type** with all feature variants.\n\n## Features\n- Rule-based styling\n- Click actions\n- Color palettes\n- Accessibility modes\n\n| Chart | Variants |\n| --- | --- |\n| Bar | Vertical, Horizontal, Stacked |\n| Line | Smooth, Area, Stepped |\n| Pie | Donut, Rose, Labels Inside |",
              },
            },
          },
          { id: uuid(), chartType: "json", connectionId: neo4jId,
            query: "MATCH (m:Movie) RETURN m ORDER BY m.released DESC LIMIT 3",
            settings: { title: "JSON Viewer", chartOptions: { initialExpanded: 2 } } },
          { id: uuid(), chartType: "iframe", connectionId: "", query: "",
            settings: {
              title: "Embedded Content",
              chartOptions: { url: "https://en.wikipedia.org/wiki/Data_visualization", iframeTitle: "Data Visualization — Wikipedia" },
            },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 6 },
          { i: null, x: 6, y: 0, w: 6, h: 6 },
          { i: null, x: 0, y: 6, w: 12, h: 5 },
        ],
      },

      // ── Page 12: Map Chart ──────────────────────────────────────
      {
        id: uuid(),
        title: "Map Chart",
        widgets: [
          // OSM — cities by population
          { id: uuid(), chartType: "map", connectionId: neo4jId, query: Q.mapCities,
            settings: { title: "Cities (OSM)", chartOptions: { tileLayer: "osm", autoFitBounds: true, markerSize: 8, showPopup: true } } },
          // Carto Light — filming locations
          { id: uuid(), chartType: "map", connectionId: neo4jId, query: Q.mapFilming,
            settings: { title: "Filming Locations (Carto Light)", chartOptions: { tileLayer: "carto-light", autoFitBounds: true, markerSize: 10 } } },
          // Carto Dark — birthplaces
          { id: uuid(), chartType: "map", connectionId: neo4jId, query: Q.mapBirthplaces,
            settings: { title: "Birthplaces (Carto Dark)", chartOptions: { tileLayer: "carto-dark", autoFitBounds: true } } },
          // Cluster markers
          { id: uuid(), chartType: "map", connectionId: neo4jId, query: Q.mapCities,
            settings: { title: "Clustered Markers", chartOptions: { clusterMarkers: true, autoFitBounds: true } } },
          // Custom zoom + no popup
          { id: uuid(), chartType: "map", connectionId: neo4jId, query: Q.mapCities,
            settings: { title: "Zoom 4 / No Popup", chartOptions: { zoom: 4, minZoom: 2, maxZoom: 10, showPopup: false, autoFitBounds: false } } },
          // Large markers + click action
          { id: uuid(), chartType: "map", connectionId: neo4jId, query: Q.mapCities,
            settings: { title: "Large Markers + Click", chartOptions: { markerSize: 14, autoFitBounds: true }, clickAction: clickSetParam("name", "map_city") } },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 5 },
          { i: null, x: 4, y: 0, w: 4, h: 5 },
          { i: null, x: 8, y: 0, w: 4, h: 5 },
          { i: null, x: 0, y: 5, w: 4, h: 5 },
          { i: null, x: 4, y: 5, w: 4, h: 5 },
          { i: null, x: 8, y: 5, w: 4, h: 5 },
        ],
      },

      // ── Page 13: Graph Chart ─────────────────────────────────────
      {
        id: uuid(),
        title: "Graph Chart",
        widgets: [
          { id: uuid(), chartType: "graph", connectionId: neo4jId, query: Q.graphData,
            settings: { title: "Force Layout (default)", chartOptions: { layout: "force", showLabels: true, showRelationshipLabels: true, physics: true } } },
          { id: uuid(), chartType: "graph", connectionId: neo4jId, query: Q.graphSmall,
            settings: { title: "Circular Layout", chartOptions: { layout: "circular", showLabels: true } } },
          { id: uuid(), chartType: "graph", connectionId: neo4jId, query: Q.graphSmall,
            settings: { title: "Hierarchical", chartOptions: { layout: "hierarchical", showLabels: true } } },
          { id: uuid(), chartType: "graph", connectionId: neo4jId, query: Q.graphSmall,
            settings: { title: "No Labels / No Physics", chartOptions: { showLabels: false, showRelationshipLabels: false, physics: false, nodeSize: "large" } } },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 6 },
          { i: null, x: 6, y: 0, w: 6, h: 6 },
          { i: null, x: 0, y: 6, w: 6, h: 6 },
          { i: null, x: 6, y: 6, w: 6, h: 6 },
        ],
      },

      // ── Page 13: Parameter Widgets ─────────────────────────────────
      {
        id: uuid(),
        title: "Parameter Widgets",
        widgets: [
          { id: uuid(), chartType: "parameter-select", connectionId: neo4jId, query: "",
            settings: { title: "Select (Searchable)", chartOptions: { parameterType: "select", parameterName: "cat_person", seedQuery: Q.selectSeed, searchable: true, placeholder: "Choose a person\u2026" } } },
          { id: uuid(), chartType: "parameter-select", connectionId: neo4jId, query: "",
            settings: { title: "Select (Not Searchable)", chartOptions: { parameterType: "select", parameterName: "cat_person2", seedQuery: Q.selectSeed, searchable: false } } },
          { id: uuid(), chartType: "parameter-select", connectionId: "", query: "",
            settings: { title: "Free Text", chartOptions: { parameterType: "text", parameterName: "cat_text", placeholder: "Type anything\u2026" } } },
          { id: uuid(), chartType: "parameter-select", connectionId: "", query: "",
            settings: { title: "Date Picker", chartOptions: { parameterType: "date", parameterName: "cat_date" } } },
          { id: uuid(), chartType: "parameter-select", connectionId: "", query: "",
            settings: { title: "Date Range", chartOptions: { parameterType: "date-range", parameterName: "cat_daterange" } } },
          { id: uuid(), chartType: "parameter-select", connectionId: "", query: "",
            settings: { title: "Relative Date", chartOptions: { parameterType: "date-relative", parameterName: "cat_reldate" } } },
          // Bound widget showing parameter in use
          { id: uuid(), chartType: "table", connectionId: neo4jId,
            query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WHERE p.name = $param_cat_person RETURN m.title AS movie, m.released AS year ORDER BY year",
            settings: { title: "Movies for $param_cat_person" } },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 2 },
          { i: null, x: 4, y: 0, w: 4, h: 2 },
          { i: null, x: 8, y: 0, w: 4, h: 2 },
          { i: null, x: 0, y: 2, w: 4, h: 2 },
          { i: null, x: 4, y: 2, w: 4, h: 2 },
          { i: null, x: 8, y: 2, w: 4, h: 2 },
          { i: null, x: 0, y: 4, w: 12, h: 4 },
        ],
      },

      // ── Page 14: Form Widget ───────────────────────────────────────
      {
        id: uuid(),
        title: "Form Widget",
        widgets: [
          { id: uuid(), chartType: "form", connectionId: neo4jId,
            query: "CREATE (n:Feedback {author: $param_cat_author, message: $param_cat_msg}) RETURN n.author AS author",
            settings: {
              title: "Default Form",
              formFields: [
                { id: uuid(), label: "Author", parameterName: "cat_author", parameterType: "text", placeholder: "Your name" },
                { id: uuid(), label: "Message", parameterName: "cat_msg", parameterType: "text", placeholder: "Your message" },
              ],
              chartOptions: { submitButtonText: "Submit", successMessage: "Feedback submitted!", resetOnSuccess: true },
            },
          },
          { id: uuid(), chartType: "form", connectionId: neo4jId,
            query: "CREATE (p:Person {name: $param_cat_name, born: toInteger($param_cat_born_min)}) RETURN p.name AS name",
            settings: {
              title: "Custom Button + No Reset",
              formFields: [
                { id: uuid(), label: "Name", parameterName: "cat_name", parameterType: "text", placeholder: "Full name" },
                { id: uuid(), label: "Born", parameterName: "cat_born", parameterType: "number-range", rangeMin: 1900, rangeMax: 2010, rangeStep: 1 },
              ],
              chartOptions: { submitButtonText: "Create Person", successMessage: "Person created!", resetOnSuccess: false },
            },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 5 },
          { i: null, x: 6, y: 0, w: 6, h: 5 },
        ],
      },

      // ── Page 15: Behavior Options ──────────────────────────────────
      {
        id: behaviorPageId,
        title: "Behavior Options",
        widgets: [
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "Refresh Button", chartOptions: { showRefreshButton: true } } },
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "Manual Run", chartOptions: { manualRun: true } } },
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "Cache Forever", chartOptions: { cacheMode: "forever", showRefreshButton: true } } },
          { id: uuid(), chartType: "line", connectionId: neo4jId, query: Q.lineData,
            settings: { title: "Line + Refresh", chartOptions: { showRefreshButton: true } } },
          { id: uuid(), chartType: "pie", connectionId: neo4jId, query: Q.pieData,
            settings: { title: "Pie + Manual Run", chartOptions: { manualRun: true } } },
          { id: uuid(), chartType: "table", connectionId: neo4jId, query: Q.tableData,
            settings: { title: "Table + Cache Forever", chartOptions: { cacheMode: "forever", showRefreshButton: true } } },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 4 },
          { i: null, x: 4, y: 0, w: 4, h: 4 },
          { i: null, x: 8, y: 0, w: 4, h: 4 },
          { i: null, x: 0, y: 4, w: 4, h: 4 },
          { i: null, x: 4, y: 4, w: 4, h: 4 },
          { i: null, x: 8, y: 4, w: 4, h: 4 },
        ],
      },

      // ── Page 16: Missing Options — Axis, Grid, Legend ──────────────
      {
        id: uuid(),
        title: "Axis & Grid Options",
        widgets: [
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "With Axis Labels", chartOptions: { xAxisLabel: "Decade", yAxisLabel: "Count" } } },
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "No Grid Lines", chartOptions: { showGridLines: false } } },
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barData,
            settings: { title: "Custom Bar Width/Gap", chartOptions: { barWidth: 20, barGap: "50%" } } },
          { id: uuid(), chartType: "bar", connectionId: neo4jId, query: Q.barMulti,
            settings: { title: "No Legend", chartOptions: { showLegend: false, stacked: true } } },
          { id: uuid(), chartType: "line", connectionId: neo4jId, query: Q.lineData,
            settings: { title: "Line + Axis Labels", chartOptions: { xAxisLabel: "Year", yAxisLabel: "Movies", showGridLines: false } } },
          { id: uuid(), chartType: "line", connectionId: neo4jId, query: Q.lineData,
            settings: { title: "Line No Legend", chartOptions: { showLegend: false } } },
          { id: uuid(), chartType: "pie", connectionId: neo4jId, query: Q.pieData,
            settings: { title: "No Labels", chartOptions: { showLabel: false } } },
          { id: uuid(), chartType: "pie", connectionId: neo4jId, query: Q.pieData,
            settings: { title: "No % + Sorted", chartOptions: { showPercentage: false, sortSlices: true } } },
          { id: uuid(), chartType: "pie", connectionId: neo4jId, query: Q.pieData,
            settings: { title: "No Legend", chartOptions: { showLegend: false } } },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 4 },
          { i: null, x: 4, y: 0, w: 4, h: 4 },
          { i: null, x: 8, y: 0, w: 4, h: 4 },
          { i: null, x: 0, y: 4, w: 4, h: 4 },
          { i: null, x: 4, y: 4, w: 4, h: 4 },
          { i: null, x: 8, y: 4, w: 4, h: 4 },
          { i: null, x: 0, y: 8, w: 4, h: 4 },
          { i: null, x: 4, y: 8, w: 4, h: 4 },
          { i: null, x: 8, y: 8, w: 4, h: 4 },
        ],
      },

      // ── Page 17: Missing Options — Table, Gauge, Others ────────────
      {
        id: uuid(),
        title: "Advanced Options",
        widgets: [
          { id: uuid(), chartType: "table", connectionId: neo4jId, query: Q.tableData,
            settings: { title: "No Pagination (pageSize=100)", chartOptions: { enablePagination: false, pageSize: 100 } } },
          { id: uuid(), chartType: "table", connectionId: neo4jId, query: Q.tableData,
            settings: { title: "Page Size 5", chartOptions: { pageSize: 5 } } },
          { id: uuid(), chartType: "gauge", connectionId: neo4jId, query: Q.gaugeData,
            settings: { title: "Min=0 Max=200", chartOptions: { min: 0, max: 200 } } },
          { id: uuid(), chartType: "gauge", connectionId: neo4jId, query: Q.gaugeData,
            settings: { title: "No Progress Arc", chartOptions: { showProgress: false } } },
          { id: uuid(), chartType: "gauge", connectionId: neo4jId, query: Q.gaugeData,
            settings: { title: "No Detail", chartOptions: { showDetail: false } } },
          { id: uuid(), chartType: "radar", connectionId: neo4jId, query: Q.radarData,
            settings: { title: "Radar No Legend", chartOptions: { showLegend: false } } },
          { id: uuid(), chartType: "sankey", connectionId: neo4jId, query: Q.sankeyData,
            settings: { title: "No Labels + Wide Nodes", chartOptions: { showLabels: false, nodeWidth: 30, nodeGap: 12 } } },
          { id: uuid(), chartType: "sunburst", connectionId: neo4jId, query: Q.sunburstData,
            settings: { title: "Sort Asc + No Highlight", chartOptions: { sort: "asc", highlightOnHover: false } } },
          { id: uuid(), chartType: "treemap", connectionId: neo4jId, query: Q.treemapData,
            settings: { title: "No Labels + Low Saturation", chartOptions: { showLabels: false, colorSaturation: "low" } } },
          { id: uuid(), chartType: "treemap", connectionId: neo4jId, query: Q.treemapData,
            settings: { title: "No Breadcrumb + High Saturation", chartOptions: { showBreadcrumb: false, colorSaturation: "high" } } },
          { id: uuid(), chartType: "json", connectionId: neo4jId,
            query: "MATCH (m:Movie) RETURN m ORDER BY m.released DESC LIMIT 3",
            settings: { title: "JSON Large + Light Theme", chartOptions: { initialExpanded: 3, fontSize: "lg", theme: "light", showCopyButton: false } } },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 5 },
          { i: null, x: 6, y: 0, w: 6, h: 5 },
          { i: null, x: 0, y: 5, w: 3, h: 4 },
          { i: null, x: 3, y: 5, w: 3, h: 4 },
          { i: null, x: 6, y: 5, w: 3, h: 4 },
          { i: null, x: 9, y: 5, w: 3, h: 4 },
          { i: null, x: 0, y: 9, w: 4, h: 4 },
          { i: null, x: 4, y: 9, w: 4, h: 4 },
          { i: null, x: 8, y: 9, w: 4, h: 4 },
          { i: null, x: 0, y: 13, w: 6, h: 4 },
          { i: null, x: 6, y: 13, w: 6, h: 4 },
        ],
      },

      // ── Page 18: Detail (click target) ─────────────────────────────
      {
        id: detailPageId,
        title: "Detail View",
        widgets: [
          { id: uuid(), chartType: "single-value", connectionId: neo4jId,
            query: "RETURN $param_bar_decade AS value",
            settings: { title: "Selected Decade", chartOptions: { fontSize: "xl", prefix: "Decade: " } } },
          { id: uuid(), chartType: "table", connectionId: neo4jId,
            query: "MATCH (m:Movie) WHERE (m.released / 10) * 10 = toInteger($param_bar_decade) RETURN m.title AS title, m.released AS year ORDER BY year",
            settings: { title: "Movies in Decade" } },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 4, h: 3 },
          { i: null, x: 4, y: 0, w: 8, h: 6 },
        ],
      },
    ],
  };
}

function patchGridIds(layout) {
  for (const page of layout.pages) {
    for (let idx = 0; idx < page.gridLayout.length; idx++) {
      if (idx < page.widgets.length) {
        page.gridLayout[idx].i = page.widgets[idx].id;
      }
    }
  }
}

async function upsertConnector(sql, userId, name, type, config, encryptionKey) {
  const existing = await sql`
    SELECT id FROM "connection" WHERE name = ${name} AND "userId" = ${userId}
  `;
  if (existing.length > 0) {
    const encrypted = encryptJson(config, encryptionKey);
    await sql`
      UPDATE "connection"
      SET "configEncrypted" = ${encrypted}, "updatedAt" = NOW()
      WHERE id = ${existing[0].id}
    `;
    return existing[0].id;
  }

  const id = uuid();
  const encrypted = encryptJson(config, encryptionKey);
  await sql`
    INSERT INTO "connection" (id, "userId", name, type, "configEncrypted", "createdAt", "updatedAt")
    VALUES (${id}, ${userId}, ${name}, ${type}, ${encrypted}, NOW(), NOW())
  `;
  return id;
}

async function upsertDashboard(sql, userId, name, description, layout, isPublic = false) {
  const existing = await sql`
    SELECT id FROM "dashboard" WHERE name = ${name} AND "userId" = ${userId}
  `;
  if (existing.length > 0) {
    // Update existing dashboard layout so re-running refreshes the demo data
    await sql`
      UPDATE "dashboard"
      SET "layoutJson" = ${sql.json(layout)}, "isPublic" = ${isPublic}, "updatedAt" = NOW()
      WHERE id = ${existing[0].id}
    `;
    console.log(`    Dashboard "${name}" already exists — layout updated.`);
    return existing[0].id;
  }

  const id = uuid();
  await sql`
    INSERT INTO "dashboard" (id, "userId", tenant_id, name, description, "layoutJson", "isPublic", "createdAt", "updatedAt")
    VALUES (${id}, ${userId}, ${"default"}, ${name}, ${description}, ${sql.json(layout)}, ${isPublic}, NOW(), NOW())
  `;
  console.log(`    Dashboard "${name}" created.`);
  return id;
}

// ─── Transform Playground ─────────────────────────────────────────────────
export function buildTransformPlayground(neo4jConnId) {
  const w = (id, chartType, query, settings) => ({
    id, chartType, connectionId: neo4jConnId, query,
    settings: { ...settings, chartOptions: settings.chartOptions ?? {} },
  });

  return {
    version: 2,
    pages: [
      {
        id: "page-filter-sort",
        title: "Filter & Sort",
        widgets: [
          w("tf1", "bar",
            "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS movie, count(p) AS cast_size ORDER BY cast_size DESC LIMIT 20",
            { title: "Top Movies — filter cast_size > 3", transforms: [{ type: "filter", column: "cast_size", operator: ">", value: 3 }] }),
          w("tf2", "table",
            "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS actor, count(m) AS movies RETURN actor, movies ORDER BY movies DESC LIMIT 30",
            { title: "Actors sorted desc + limit 10", chartOptions: { enableSorting: true }, transforms: [{ type: "sort", column: "movies", direction: "desc" }, { type: "limit", count: 10 }] }),
          w("tf3", "bar",
            "MATCH (m:Movie) RETURN m.released AS year, count(*) AS count ORDER BY year",
            { title: "1990s only (chained filters)", transforms: [{ type: "filter", column: "year", operator: ">=", value: 1990 }, { type: "filter", column: "year", operator: "<", value: 2000 }] }),
        ],
        gridLayout: [
          { i: "tf1", x: 0, y: 0, w: 6, h: 4 },
          { i: "tf2", x: 6, y: 0, w: 6, h: 5 },
          { i: "tf3", x: 0, y: 5, w: 8, h: 4 },
        ],
      },
      {
        id: "page-agg-calc",
        title: "GroupBy & Calculated",
        widgets: [
          w("tf4", "table",
            "MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS role, p.name AS person, m.released AS year",
            { title: "Group by role — count + avg year", chartOptions: { enableSorting: true }, transforms: [{ type: "groupBy", column: "role", aggregations: [{ column: "person", fn: "count" }, { column: "year", fn: "avg" }] }] }),
          w("tf5", "table",
            "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS actor, count(m) AS movies RETURN actor, movies ORDER BY movies DESC LIMIT 20",
            { title: "Calculated: movies × 10 = score", chartOptions: { enableSorting: true }, transforms: [{ type: "calculatedColumn", name: "score", expression: "movies * 10" }] }),
          w("tf6", "bar",
            "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS actor, count(m) AS movies RETURN actor, movies ORDER BY movies DESC LIMIT 15",
            { title: "rename → filter → limit pipeline", transforms: [{ type: "renameColumns", mapping: { actor: "Star", movies: "Films" } }, { type: "filter", column: "Films", operator: ">=", value: 3 }, { type: "limit", count: 5 }] }),
        ],
        gridLayout: [
          { i: "tf4", x: 0, y: 0, w: 6, h: 5 },
          { i: "tf5", x: 6, y: 0, w: 6, h: 5 },
          { i: "tf6", x: 0, y: 5, w: 8, h: 4 },
        ],
      },
    ],
  };
}

main().catch((err) => {
  console.error("    Seed failed:", err.message);
  process.exit(1);
});
