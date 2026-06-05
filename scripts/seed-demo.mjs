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
      "    DATABASE_URL or ENCRYPTION_KEY missing in .env.local — skipping seed.",
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
      console.log(
        "    Creating admin user (admin@neoboard.local / admin123)...",
      );
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
    // Connection URIs are always seeded with `localhost`. Docker compose
    // publishes Postgres/Neo4j ports to the host, so both the host dev
    // server and any container-app reach them the same way. Previously this
    // honored NEO4J_HOST/PG_HOST env vars; when the seed ran inside the
    // docker-app container those env vars baked container hostnames
    // (`neoboard-neo4j`, `neoboard-postgres`) into the encrypted config,
    // which then broke any `npm run dev` on the host (#898).
    //
    // To target non-localhost connections, edit them in the Connections UI
    // after seeding.
    const neo4jHost = "localhost";
    const pgHost = "localhost";
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
      encryptionKey,
    );
    const pgConnId = await upsertConnector(
      sql,
      adminId,
      "PostgreSQL Movies",
      "postgresql",
      pgConfig,
      encryptionKey,
    );

    // Demo e-commerce connections — point at the isolated
    // `neoboard_demo_public` schema on the `neoboard` config DB.
    // IMPORTANT: the Postgres connector reads the database name from the
    // URI path (PostgresAuthenticationModule.ts:38), not the `database`
    // field, so `/neoboard` must be in the URI.
    const ecommerceConfig = {
      uri: `postgresql://${pgHost}:5432/neoboard`,
      username: "neoboard",
      password: "neoboard",
      database: "neoboard",
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

    // 3. Recreate the demo e-commerce schema + deterministic data
    await recreateEcommerceSchema(sql);
    await seedEcommerceData(sql);

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
        console.error(`    Failed to import ${showcase.key}: ${err.message}`);
        throw err;
      }
    }
  } finally {
    await sql.end();
  }
}

// ─── Insert helpers ──────────────────────────────────────────────────

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

async function upsertDashboard(
  sql,
  userId,
  name,
  description,
  layout,
  isPublic = false,
) {
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
