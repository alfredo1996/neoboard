#!/usr/bin/env node

/**
 * Seed demo connectors and dashboards into the NeoBoard database.
 *
 * Idempotent — checks by name before inserting. Safe to run multiple times.
 *
 * Usage:  node scripts/seed-demo.mjs
 * Called automatically by scripts/setup.sh after migrations.
 */

import { createRequire } from "module";
import { randomBytes, createCipheriv, randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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

// ─── Dashboard layouts ───────────────────────────────────────────────

function buildWidgetShowcase(neo4jConnId, pgConnId) {
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
                targetColumn: "released",
                rules: [
                  { id: uuid(), operator: "<=", value: 1995, color: "#3b82f620", target: "backgroundColor" },
                  { id: uuid(), operator: "<=", value: 2005, color: "#22c55e20", target: "backgroundColor" },
                  { id: uuid(), operator: "<=", value: 2015, color: "#f59e0b20", target: "backgroundColor" },
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
                rules: [
                  { field: "value", operator: ">", value: 5, target: "color", style: "#ef4444" },
                  { field: "value", operator: "<=", value: 3, target: "color", style: "#22c55e" },
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
                rules: [
                  { field: "value", operator: ">", value: 30, target: "color", style: "#3b82f6" },
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
                rules: [
                  { field: "value", operator: ">", value: 10, target: "color", style: "#f97316" },
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
            settings: { title: "deep-ocean (default)", colorPalette: "deep-ocean" },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "warm-sunset", colorPalette: "warm-sunset" },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "cool-breeze", colorPalette: "cool-breeze" },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "earth-tones", colorPalette: "earth-tones" },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "neon", colorPalette: "neon" },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: neo4jConnId,
            query:
              "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
            settings: { title: "monochrome", colorPalette: "monochrome" },
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
              colorblindMode: true,
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

function buildParameterTesting(neo4jConnId, pgConnId) {
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

function buildFormTesting(neo4jConnId, pgConnId) {
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

function buildClickActionDemo(neo4jConnId, pgConnId) {
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

  const sql = postgres(databaseUrl, { max: 1 });

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

    // 2. Create connectors (idempotent by name)
    const neo4jConfig = {
      uri: "neo4j://localhost:7687",
      username: "neo4j",
      password: "neoboard123",
      database: "neo4j",
    };
    const pgConfig = {
      uri: "postgresql://localhost:5432",
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

    console.log(`    Neo4j connector:      ${neo4jConnId}`);
    console.log(`    PostgreSQL connector:  ${pgConnId}`);

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

    console.log("    Demo dashboards seeded.");
  } finally {
    await sql.end();
  }
}

function buildStylingRulesDemo(neo4jConnId, pgConnId) {
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

/** Set gridLayout[n].i = widgets[n].id for each page. */
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

main().catch((err) => {
  console.error("    Seed failed:", err.message);
  process.exit(1);
});
