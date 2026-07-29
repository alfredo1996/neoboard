import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/docker.js", () => ({
  composePs: vi.fn(() => [
    { name: "neoboard-postgres", state: "running", status: "Up" },
    { name: "neoboard-neo4j", state: "running", status: "Up" },
  ]),
  isPgReady: vi.fn(() => true),
  isNeo4jReady: vi.fn(() => true),
}));

vi.mock("../../lib/exec.js", () => ({
  runOrNull: vi.fn(() => "200"),
}));

vi.mock("../../lib/config.js", () => ({
  assertCheckout: vi.fn(),
  paths: {
    journalPath: "/project/app/drizzle/migrations/meta/_journal.json",
    root: "/project",
  },
  getMode: vi.fn(() => "docker"),
  readProjectConfig: vi.fn(() => ({
    ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
  })),
}));

vi.mock("../../lib/output.js", () => ({
  info: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn((p: string) => {
    if (p.includes("_journal.json")) {
      return JSON.stringify({
        entries: [{ idx: 0, tag: "0000_wooden_zeigeist" }],
      });
    }
    if (p.includes("package.json")) {
      return JSON.stringify({ version: "0.0.1" });
    }
    return "{}";
  }),
}));

import { composePs, isPgReady, isNeo4jReady } from "../../lib/docker.js";
import { runOrNull } from "../../lib/exec.js";
import { info } from "../../lib/output.js";
import { runStatus } from "../../commands/status.js";

const mockComposePs = vi.mocked(composePs);
const mockIsPgReady = vi.mocked(isPgReady);
const mockIsNeo4jReady = vi.mocked(isNeo4jReady);
const mockRunOrNull = vi.mocked(runOrNull);

/** What a curl of /api/health prints: body, then the status code on its own line. */
const HEALTHY_PROBE = '{"data":{"status":"ok","errors":[],"warnings":[]}}\n200';

beforeEach(() => {
  vi.clearAllMocks();
  mockComposePs.mockReturnValue([
    { name: "neoboard-postgres", state: "running", status: "Up" },
    { name: "neoboard-neo4j", state: "running", status: "Up" },
  ]);
  mockIsPgReady.mockReturnValue(true);
  mockIsNeo4jReady.mockReturnValue(true);
  // Set explicitly: clearAllMocks drops recorded calls but NOT an
  // implementation, so a probe stubbed by one test would leak into the next.
  mockRunOrNull.mockReturnValue(HEALTHY_PROBE);
});

describe("runStatus", () => {
  it("displays mode and version", async () => {
    await runStatus();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("docker"));
    expect(info).toHaveBeenCalledWith(expect.stringContaining("0.0.1"));
  });

  it("shows container count", async () => {
    await runStatus();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("2 containers"));
  });

  it("shows healthy services", async () => {
    await runStatus();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("PostgreSQL   healthy"),
    );
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("Neo4j        healthy"),
    );
  });

  it("shows stopped services", async () => {
    mockIsPgReady.mockReturnValue(false);
    mockIsNeo4jReady.mockReturnValue(false);
    await runStatus();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("PostgreSQL   stopped"),
    );
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("Neo4j        stopped"),
    );
  });

  it("shows migration status", async () => {
    await runStatus();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("1 applied"));
  });

  it("shows no containers when none running", async () => {
    mockComposePs.mockReturnValue([]);
    await runStatus();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("no containers"));
  });
});

// `/` is auth-gated and correctly 307s to /login for the sessionless request
// curl makes, so probing it reported EVERY healthy install as
// "unhealthy (HTTP 307)" — there was no state in which that line was right.
describe("runStatus — app health (#1368)", () => {
  /** The "App ..." row of the status table. */
  const appRow = () =>
    vi
      .mocked(info)
      .mock.calls.map((c) => String(c[0]))
      .find((line) => line.startsWith("App "));

  it("probes /api/health, not /", async () => {
    await runStatus();
    expect(mockRunOrNull).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:3000/api/health"),
    );
  });

  it("reports healthy when /api/health returns 200 with no errors", async () => {
    await runStatus();
    expect(appRow()).toContain("healthy");
    expect(appRow()).not.toContain("unhealthy");
  });

  // REGRESSION GUARD: the redirect on / must never reach the status line.
  it("never reads a 307 from / as unhealthy", async () => {
    mockRunOrNull.mockImplementation((cmd: string) =>
      cmd.includes("/api/health") ? HEALTHY_PROBE : "307",
    );
    await runStatus();
    expect(appRow()).not.toContain("unhealthy");
    expect(appRow()).not.toContain("307");
  });

  it("reports unhealthy with the HTTP code when health returns 503", async () => {
    mockRunOrNull.mockReturnValue(
      '{"data":{"status":"error","errors":["DATABASE_URL is not set"]}}\n503',
    );
    await runStatus();
    expect(appRow()).toContain("unhealthy (HTTP 503)");
  });

  // An app that is up but degraded used to read identically to a healthy one.
  it("reports unhealthy with the reason when a 200 payload carries errors", async () => {
    mockRunOrNull.mockReturnValue(
      '{"data":{"status":"error","errors":["ENCRYPTION_KEY is invalid"]}}\n200',
    );
    await runStatus();
    expect(appRow()).toContain("unhealthy (ENCRYPTION_KEY is invalid)");
  });

  it("reads errors from an un-enveloped health payload too", async () => {
    mockRunOrNull.mockReturnValue(
      '{"status":"error","errors":["database unreachable"]}\n200',
    );
    await runStatus();
    expect(appRow()).toContain("unhealthy (database unreachable)");
  });

  it("reports not running when curl fails", async () => {
    mockRunOrNull.mockReturnValue(null);
    await runStatus();
    expect(appRow()).toContain("not running");
  });

  // A 200 means the app answered. An unreadable body is not grounds for
  // inventing a failure — that is the false negative this issue is about.
  it("reports healthy on a 200 whose body cannot be parsed", async () => {
    mockRunOrNull.mockReturnValue("not json\n200");
    await runStatus();
    expect(appRow()).toContain("healthy");
    expect(appRow()).not.toContain("unhealthy");
  });
});
