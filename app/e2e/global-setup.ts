import {
  GenericContainer,
  Wait,
} from "testcontainers";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as http from "node:http";
import { spawn } from "node:child_process";
import postgres from "postgres";
import { initCoverage, loadNextcovConfig } from "nextcov/playwright";

const STATE_FILE = path.join(__dirname, ".containers-state.json");
const SERVER_PID_FILE = path.join(__dirname, ".server-pid");
const ENV_FILE = path.join(__dirname, "..", ".env.test");
const ENV_LOCAL = path.join(__dirname, "..", ".env.local");
const ENV_LOCAL_BAK = path.join(__dirname, "..", ".env.local.bak");

// Stable test secrets (not real — only for local E2E)
const TEST_ENCRYPTION_KEY =
  "b8c0dbaad415694973d7cf4a3a40d4e53fc940493a6362ecff4dae45245e05d9";
const TEST_NEXTAUTH_SECRET =
  "d0eece19938fc5e2e3e45ed76fb5c92b0fc6ba2c4f213404ccca7ea0e641cd65";

/** Encrypt JSON using the same algorithm as the app (aes-256-gcm). */
function encryptJson(data: unknown): string {
  const key = Buffer.from(TEST_ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(JSON.stringify(data), "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** Update seeded connection rows with properly encrypted configs using the real ports. */
async function updateConnectionConfigs(
  pgHost: string,
  pgPort: number,
  neo4jBoltPort: number,
) {
  const neo4jConfig = encryptJson({
    uri: `bolt://localhost:${neo4jBoltPort}`,
    username: "neo4j",
    password: "neoboard123",
  });
  const pgConfig = encryptJson({
    uri: `postgresql://localhost:${pgPort}`,
    username: "neoboard",
    password: "neoboard",
    database: "movies",
  });

  const sql = postgres(
    `postgresql://neoboard:neoboard@${pgHost}:${pgPort}/neoboard`,
    { max: 1, idle_timeout: 5 },
  );
  try {
    await sql`UPDATE "connection" SET "configEncrypted" = ${neo4jConfig} WHERE "id" = 'conn-neo4j-001'`;
    await sql`UPDATE "connection" SET "configEncrypted" = ${pgConfig} WHERE "id" = 'conn-pg-001'`;
    console.log("✅ Seeded connections updated with test container ports");
  } finally {
    await sql.end();
  }
}

export default async function globalSetup() {
  const dockerRoot = path.resolve(__dirname, "..", "..", "docker");
  const pgInitSql = path.join(dockerRoot, "postgres", "init-test.sql");
  const neo4jInitCypher = path.join(dockerRoot, "neo4j", "init.cypher");

  console.log("\n⏳ Starting test containers...\n");

  // Start both containers in parallel to minimise total startup time.
  const [pgContainer, neo4jContainer] = await Promise.all([
    new GenericContainer("postgres:16-alpine")
      .withEnvironment({
        POSTGRES_USER: "neoboard",
        POSTGRES_PASSWORD: "neoboard",
        POSTGRES_DB: "neoboard",
      })
      .withExposedPorts(5432)
      .withCopyFilesToContainer([
        {
          source: pgInitSql,
          target: "/docker-entrypoint-initdb.d/init-test.sql",
        },
      ])
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .withStartupTimeout(60_000)
      .start(),

    new GenericContainer("neo4j:5-community")
      .withEnvironment({
        NEO4J_AUTH: "neo4j/neoboard123",
        NEO4J_PLUGINS: '[""]',
      })
      .withExposedPorts(7474, 7687)
      .withCopyFilesToContainer([
        {
          source: neo4jInitCypher,
          target: "/var/lib/neo4j/import/init.cypher",
        },
      ])
      .withWaitStrategy(Wait.forLogMessage(/Started\./, 1))
      .withStartupTimeout(120_000)
      .start(),
  ]);

  const pgHost = pgContainer.getHost();
  const pgPort = pgContainer.getMappedPort(5432);
  const neo4jBoltPort = neo4jContainer.getMappedPort(7687);
  const neo4jHttpPort = neo4jContainer.getMappedPort(7474);

  console.log(`✅ PostgreSQL ready at port ${pgPort}`);
  console.log(
    `✅ Neo4j ready at bolt port ${neo4jBoltPort}, http port ${neo4jHttpPort}`,
  );

  // Seed Neo4j with the init.cypher via cypher-shell inside the container.
  console.log("⏳ Seeding Neo4j with movies dataset...");
  const seedResult = await neo4jContainer.exec([
    "cypher-shell",
    "-u", "neo4j",
    "-p", "neoboard123",
    "-f", "/var/lib/neo4j/import/init.cypher",
  ]);
  if (seedResult.exitCode !== 0) {
    console.error("❌ Neo4j seed failed:", seedResult.output);
    throw new Error(`Neo4j seed failed with exit code ${seedResult.exitCode}`);
  }
  console.log("✅ Neo4j seeded successfully");

  // Save container IDs so teardown can remove them.
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({
      pgContainerId: pgContainer.getId(),
      neo4jContainerId: neo4jContainer.getId(),
    }),
  );

  // ── Encrypt real connection configs and update the seeded rows ──────────
  console.log("⏳ Updating seeded connection configs with encrypted values...");
  await updateConnectionConfigs(pgHost, pgPort, neo4jBoltPort);

  // ── Write .env.test for the Next.js dev server ──────────────────────────
  const databaseUrl = `postgresql://neoboard:neoboard@${pgHost}:${pgPort}/neoboard`;
  const envContent = [
    `DATABASE_URL=${databaseUrl}`,
    `ENCRYPTION_KEY=${TEST_ENCRYPTION_KEY}`,
    `NEXTAUTH_SECRET=${TEST_NEXTAUTH_SECRET}`,
    `NEXTAUTH_URL=http://localhost:3000`,
    `# Test container ports (for reference in tests)`,
    `TEST_NEO4J_BOLT_URL=bolt://localhost:${neo4jBoltPort}`,
    `TEST_NEO4J_HTTP_PORT=${neo4jHttpPort}`,
    `TEST_PG_PORT=${pgPort}`,
    "",
  ].join("\n");

  fs.writeFileSync(ENV_FILE, envContent);
  console.log(`✅ Wrote ${ENV_FILE}`);

  // Back up existing .env.local (or .env) and replace with test env.
  const ENV_BASE = path.join(__dirname, "..", ".env");
  if (fs.existsSync(ENV_BASE)) {
    fs.copyFileSync(ENV_BASE, ENV_LOCAL_BAK);
    console.log("📦 Backed up .env → .env.local.bak");
  } else if (fs.existsSync(ENV_LOCAL)) {
    fs.copyFileSync(ENV_LOCAL, ENV_LOCAL_BAK);
    console.log("📦 Backed up .env.local → .env.local.bak");
  }
  fs.copyFileSync(ENV_FILE, ENV_LOCAL);
  console.log("✅ Copied .env.test → .env.local for Next.js");

  // Expose env vars to the current process (available to test workers).
  process.env.DATABASE_URL = databaseUrl;
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  process.env.NEXTAUTH_SECRET = TEST_NEXTAUTH_SECRET;
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  process.env.TEST_NEO4J_BOLT_URL = `bolt://localhost:${neo4jBoltPort}`;
  process.env.TEST_PG_PORT = String(pgPort);

  // ── CI: start the Next.js production server ─────────────────────────────
  // Playwright waits for webServer port BEFORE running globalSetup, so we
  // can't use the webServer config in CI (it would deadlock — the server
  // needs .env.local which we just wrote). Instead, we start it here.
  if (process.env.CI) {
    console.log("⏳ Starting Next.js production server...");
    const appDir = path.resolve(__dirname, "..");
    const server = spawn("npx", ["next", "start", "--port", "3000"], {
      cwd: appDir,
      stdio: "pipe",
      env: { ...process.env },
      detached: true,
    });
    server.unref();

    // Forward server output to the console for debugging.
    server.stdout?.on("data", (d: Buffer) =>
      process.stdout.write(`[NextServer] ${d}`),
    );
    server.stderr?.on("data", (d: Buffer) =>
      process.stderr.write(`[NextServer] ${d}`),
    );

    // Save PID so globalTeardown can kill it.
    fs.writeFileSync(SERVER_PID_FILE, String(server.pid));

    // Wait for port 3000 to accept connections (up to 60 s).
    await waitForPort(3000, 60_000);
    console.log("✅ Next.js server ready on port 3000");
  }

  // ── Initialize E2E coverage collection (nextcov) ────────────────────────
  if (process.env.E2E_COVERAGE) {
    console.log("⏳ Initializing E2E coverage collection...");
    const nextcovConfig = await loadNextcovConfig(
      path.resolve(__dirname, "..", "playwright.config.ts"),
    );
    await initCoverage(nextcovConfig);
    console.log("✅ E2E coverage initialized");
  }

  console.log("\n✅ All containers ready. Starting tests...\n");
}

/** Poll until `port` accepts a TCP connection, or throw after `timeoutMs`. */
function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(`http://localhost:${port}/`, (res) => {
        res.resume(); // Consume the response to free memory.
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Port ${port} not available after ${timeoutMs}ms`));
        } else {
          setTimeout(check, 500);
        }
      });
    }
    check();
  });
}
