import { GenericContainer, Wait } from "testcontainers";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as net from "node:net";
import * as http from "node:http";
import { spawn, execSync } from "node:child_process";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { initCoverage, loadNextcovConfig } from "nextcov/playwright";

const STATE_FILE = path.join(__dirname, ".containers-state.json");
const SERVER_PID_FILE = path.join(__dirname, ".server-pid");
const ENV_FILE = path.join(__dirname, "..", ".env.test");

// Stable test secrets (not real — only for local E2E)
const TEST_ENCRYPTION_KEY =
  "b8c0dbaad415694973d7cf4a3a40d4e53fc940493a6362ecff4dae45245e05d9";
const TEST_NEXTAUTH_SECRET =
  "d0eece19938fc5e2e3e45ed76fb5c92b0fc6ba2c4f213404ccca7ea0e641cd65";
const TEST_API_KEY_HMAC_SECRET =
  "a1f3c9e2d47b6a85f0e12d3c4b5a6978f0e1d2c3b4a59687f0e1d2c3b4a59687";

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

/** Bind to port 0 to let the OS assign an available port, then release it. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

const MIGRATIONS_FOLDER = path.resolve(
  __dirname,
  "..",
  "drizzle",
  "migrations",
);

/** Run all Drizzle migrations against the neoboard database. */
async function runDrizzleMigrations(connectionString: string) {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await client.end();
}

/** Seed the neoboard database with test data (users, connections, dashboards). */
async function seedNeoboard(connectionString: string) {
  const seedFile = path.resolve(
    __dirname,
    "..",
    "..",
    "docker",
    "postgres",
    "seed-neoboard.sql",
  );
  const seedSql = fs.readFileSync(seedFile, "utf-8");
  const client = postgres(connectionString, { max: 1 });
  await client.unsafe(seedSql);
  await client.end();
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
        // APOC is loaded for potential future use in E2E tests. It was
        // originally added for the Cypher timeout test in query-safety.spec.ts,
        // but that test intentionally avoids `apoc.util.sleep` — sleep runs
        // as pure Thread.sleep inside the transaction and bypasses Neo4j's
        // guard points, so the driver-level timeout can't interrupt it. The
        // test uses a compute-heavy UNWIND instead. Kept enabled so new
        // Cypher tests can use APOC helpers without an infra change.
        NEO4J_PLUGINS: '["apoc"]',
        NEO4J_dbms_security_procedures_unrestricted: "apoc.*",
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
    "-u",
    "neo4j",
    "-p",
    "neoboard123",
    "-f",
    "/var/lib/neo4j/import/init.cypher",
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

  // ── Run Drizzle migrations to create the neoboard schema ────────────────
  const databaseUrl = `postgresql://neoboard:neoboard@${pgHost}:${pgPort}/neoboard`;
  console.log("⏳ Running Drizzle migrations...");
  await runDrizzleMigrations(databaseUrl);
  console.log("✅ Drizzle migrations applied");

  // ── Seed neoboard with test data (users, connections, dashboards) ──────
  console.log("⏳ Seeding neoboard database...");
  await seedNeoboard(databaseUrl);
  console.log("✅ Neoboard seeded");

  // ── Encrypt real connection configs and update the seeded rows ──────────
  console.log("⏳ Updating seeded connection configs with encrypted values...");
  await updateConnectionConfigs(pgHost, pgPort, neo4jBoltPort);

  // ── Resolve the server port ──────────────────────────────────────────────
  // Use TEST_SERVER_PORT when set; otherwise default to 3100 to stay in sync
  // with playwright.config.ts which uses the same env var and the same default.
  // Using getFreePort() here would desync the server port from the baseURL that
  // Playwright evaluates before globalSetup runs.
  const serverPort =
    parseInt(process.env.TEST_SERVER_PORT || "3100", 10) ||
    (await getFreePort());

  // ── Write .env.test for the Next.js dev server ──────────────────────────
  const envContent = [
    `DATABASE_URL=${databaseUrl}`,
    `ENCRYPTION_KEY=${TEST_ENCRYPTION_KEY}`,
    `API_KEY_HMAC_SECRET=${TEST_API_KEY_HMAC_SECRET}`,
    `NEXTAUTH_SECRET=${TEST_NEXTAUTH_SECRET}`,
    `NEXTAUTH_URL=http://localhost:${serverPort}`,
    `TEST_SERVER_PORT=${serverPort}`,
    // E2E exercises /signup flows; v1.0 default is closed.
    `REGISTRATION_ENABLED=true`,
    `# Test container ports (for reference in tests)`,
    `TEST_NEO4J_BOLT_URL=bolt://localhost:${neo4jBoltPort}`,
    `TEST_NEO4J_HTTP_PORT=${neo4jHttpPort}`,
    `TEST_PG_PORT=${pgPort}`,
    "",
  ].join("\n");

  fs.writeFileSync(ENV_FILE, envContent);
  console.log(`✅ Wrote ${ENV_FILE}`);

  // Expose env vars to the current process (available to test workers).
  process.env.DATABASE_URL = databaseUrl;
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  process.env.API_KEY_HMAC_SECRET = TEST_API_KEY_HMAC_SECRET;
  process.env.NEXTAUTH_SECRET = TEST_NEXTAUTH_SECRET;
  process.env.NEXTAUTH_URL = `http://localhost:${serverPort}`;
  process.env.TEST_SERVER_PORT = String(serverPort);
  process.env.TEST_NEO4J_BOLT_URL = `bolt://localhost:${neo4jBoltPort}`;
  process.env.TEST_PG_PORT = String(pgPort);

  // ── Build & start the Next.js server on a dynamically allocated port ───
  // Always use a production build + `next start` for consistent, fast E2E
  // runs. `next dev` recompiles pages on demand which adds 10+ minutes of
  // webpack overhead locally. A one-time `next build` (~2 min) then instant
  // `next start` is what CI already does and is dramatically faster overall.
  const appDir = path.resolve(__dirname, "..");

  // Server-side coverage needs BOTH of these on the server process: nextcov
  // reads NODE_V8_COVERAGE for the data and connects over CDP to flush it
  // (nextcov README, "Production mode"). Without them the CCollector's probe
  // fails, it reports an empty result, and the warning goes to a disabled
  // logger — so `collectServer: true` silently produced client-only coverage
  // while CLAUDE.md advertised server coverage (#1606).
  //
  // Derived from the server port rather than hard-coded so two concurrent runs
  // (or a shard with TEST_SERVER_PORT set) cannot collide. The default 3100
  // gives 9230, nextcov's own default.
  const cdpPort = serverPort + 6130;
  const v8CoverageDir = path.join(appDir, ".v8-coverage");
  fs.rmSync(v8CoverageDir, { recursive: true, force: true });

  const serverEnv = {
    ...process.env,
    NODE_V8_COVERAGE: v8CoverageDir,
    CDP_PORT: String(cdpPort),
    DATABASE_URL: databaseUrl,
    ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    API_KEY_HMAC_SECRET: TEST_API_KEY_HMAC_SECRET,
    NEXTAUTH_SECRET: TEST_NEXTAUTH_SECRET,
    NEXTAUTH_URL: `http://localhost:${serverPort}`,
    REGISTRATION_ENABLED: "true",
    // Relax the auth rate limiters for the suite (#1323). Both read
    // `NODE_ENV === "test" || CI === "true"` (app/src/lib/crypto/rate-limiter.ts,
    // app/src/lib/api/with-rate-limit.ts) and `next start` needs
    // NODE_ENV=production, so CI is the only reachable switch.
    //
    // Every test logs in from 127.0.0.1, so the whole suite shares one IP
    // bucket. GitHub Actions sets CI=true itself, which is why this only ever
    // failed locally: two auth specs in one invocation cross the production
    // ceiling of 20 logins/minute, and the limiter returns null — rendered as
    // "Invalid email or password", indistinguishable from a wrong password
    // and emitting no 429 for anyone grepping the logs.
    CI: "true",
  };

  // Build once — skip if a previous build exists and E2E_SKIP_BUILD is set,
  // OR if .next/BUILD_ID already exists (auto-detect cached build).
  const buildIdPath = path.join(appDir, ".next", "BUILD_ID");
  const hasCachedBuild = fs.existsSync(buildIdPath);

  if (process.env.E2E_SKIP_BUILD && !hasCachedBuild) {
    throw new Error(
      "E2E_SKIP_BUILD is set but no prior build found at .next/BUILD_ID. " +
        "Run `npx next build` once or unset E2E_SKIP_BUILD.",
    );
  }

  if (process.env.E2E_SKIP_BUILD) {
    console.log(
      "⏩ Skipping build (E2E_SKIP_BUILD set, reusing existing .next)",
    );
  } else {
    if (hasCachedBuild) {
      console.log(
        "⏳ Rebuilding Next.js (production)... (set E2E_SKIP_BUILD=1 to reuse previous build)",
      );
    } else {
      console.log("⏳ Building Next.js (production)...");
    }
    execSync("npx next build --webpack", {
      cwd: appDir,
      stdio: "inherit",
      env: serverEnv,
    });
    console.log("✅ Next.js build complete");
  }

  console.log(`⏳ Starting Next.js production server on port ${serverPort}...`);
  // Spawned as `node --inspect <next bin>` rather than `npx next`: passing
  // --inspect through NODE_OPTIONS lets the npx wrapper inherit it and bind
  // the port first, after which the real server logs "address already in use"
  // and nextcov finds nothing to connect to (#1606).
  const nextBin = require.resolve("next/dist/bin/next");
  const args = [
    `--inspect=${cdpPort}`,
    nextBin,
    "start",
    "--port",
    String(serverPort),
  ];
  const server = spawn(process.execPath, args, {
    cwd: appDir,
    stdio: "pipe",
    env: serverEnv,
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

  // Wait for the server to accept connections (up to 60 s).
  await waitForPort(serverPort, 60_000);
  console.log(`✅ Next.js server ready on port ${serverPort}`);

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
