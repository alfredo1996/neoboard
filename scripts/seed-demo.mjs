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
  return {
    version: 2,
    pages: [
      {
        id: uuid(),
        title: "Neo4j Charts",
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
            chartType: "single-value",
            connectionId: neo4jConnId,
            query: "MATCH (p:Person) RETURN count(p) AS value",
            settings: { title: "Total People" },
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
            chartType: "json",
            connectionId: neo4jConnId,
            query:
              "MATCH (m:Movie)<-[r:ACTED_IN]-(p:Person) RETURN m.title AS movie, p.name AS actor, r.roles AS roles LIMIT 10",
            settings: { title: "Raw Data" },
          },
          {
            id: uuid(),
            chartType: "graph",
            connectionId: neo4jConnId,
            query:
              "MATCH (p:Person)-[r]->(m:Movie) WHERE m.title IN ['The Matrix', 'Cloud Atlas'] RETURN p, r, m",
            settings: { title: "Movie Network" },
          },
          {
            id: uuid(),
            chartType: "map",
            connectionId: neo4jConnId,
            query:
              "MATCH (c:City) RETURN c.name AS name, c.latitude AS latitude, c.longitude AS longitude, c.population AS population",
            settings: { title: "US Cities" },
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
          // Row 3: table + json
          { i: null, x: 0, y: 8, w: 6, h: 4 },
          { i: null, x: 6, y: 8, w: 6, h: 4 },
          // Row 4: graph + map
          { i: null, x: 0, y: 12, w: 6, h: 4 },
          { i: null, x: 6, y: 12, w: 6, h: 4 },
        ],
      },
      {
        id: uuid(),
        title: "PostgreSQL Charts",
        widgets: [
          {
            id: uuid(),
            chartType: "bar",
            connectionId: pgConnId,
            query:
              "SELECT (released / 10) * 10 AS decade, count(*) AS count FROM movies GROUP BY decade ORDER BY decade",
            settings: { title: "Movies by Decade" },
          },
          {
            id: uuid(),
            chartType: "line",
            connectionId: pgConnId,
            query:
              "SELECT released AS year, count(*) AS count FROM movies GROUP BY released ORDER BY released",
            settings: { title: "Releases Over Time" },
          },
          {
            id: uuid(),
            chartType: "pie",
            connectionId: pgConnId,
            query:
              "SELECT relationship AS type, count(*) AS count FROM roles GROUP BY relationship",
            settings: { title: "Roles Distribution" },
          },
          {
            id: uuid(),
            chartType: "single-value",
            connectionId: pgConnId,
            query: "SELECT count(*) AS value FROM people",
            settings: { title: "Total Actors" },
          },
          {
            id: uuid(),
            chartType: "single-value",
            connectionId: pgConnId,
            query: "SELECT count(*) AS value FROM movies",
            settings: { title: "Total Movies" },
          },
          {
            id: uuid(),
            chartType: "table",
            connectionId: pgConnId,
            query:
              "SELECT m.title, m.released, p.name AS actor, r.roles FROM roles r JOIN movies m ON r.movie_id = m.id JOIN people p ON r.person_id = p.id WHERE r.relationship = 'ACTED_IN' ORDER BY m.title LIMIT 50",
            settings: { title: "Movies with Cast" },
          },
          {
            id: uuid(),
            chartType: "json",
            connectionId: pgConnId,
            query:
              "SELECT m.title, m.released, m.tagline FROM movies m ORDER BY m.released DESC LIMIT 10",
            settings: { title: "Raw Query" },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 6, h: 4 },
          { i: null, x: 6, y: 0, w: 6, h: 4 },
          { i: null, x: 0, y: 4, w: 4, h: 4 },
          { i: null, x: 4, y: 4, w: 4, h: 2 },
          { i: null, x: 8, y: 4, w: 4, h: 2 },
          { i: null, x: 0, y: 6, w: 6, h: 4 },
          { i: null, x: 6, y: 6, w: 6, h: 4 },
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

function buildClickActionDemo(neo4jConnId, pgConnId) {
  // Page IDs are pre-generated so widgets can reference them in click actions
  const page1Id = uuid();
  const page2Id = uuid();
  const page3Id = uuid();

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
                parameterMapping: {
                  parameterName: "clicked_movie",
                  sourceField: "",
                },
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
                parameterMapping: {
                  parameterName: "clicked_decade",
                  sourceField: "name",
                },
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
                parameterMapping: {
                  parameterName: "clicked_movie",
                  sourceField: "",
                },
                targetPageId: page1Id,
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
                targetPageId: page2Id,
              },
            },
          },
        ],
        gridLayout: [
          { i: null, x: 0, y: 0, w: 7, h: 4 },
          { i: null, x: 7, y: 0, w: 5, h: 4 },
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
      "Every chart type across Neo4j and PostgreSQL connectors.",
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

    const clickLayout = buildClickActionDemo(neo4jConnId, pgConnId);
    patchGridIds(clickLayout);
    await upsertDashboard(
      sql,
      adminId,
      "Click Actions",
      "Cell-click sets parameters, bar-click sets parameters, and page navigation via click actions.",
      clickLayout,
      true
    );

    console.log("    Demo dashboards seeded.");
  } finally {
    await sql.end();
  }
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
