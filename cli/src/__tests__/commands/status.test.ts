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
import { info } from "../../lib/output.js";
import { runStatus } from "../../commands/status.js";

const mockComposePs = vi.mocked(composePs);
const mockIsPgReady = vi.mocked(isPgReady);
const mockIsNeo4jReady = vi.mocked(isNeo4jReady);

beforeEach(() => {
  vi.clearAllMocks();
  mockComposePs.mockReturnValue([
    { name: "neoboard-postgres", state: "running", status: "Up" },
    { name: "neoboard-neo4j", state: "running", status: "Up" },
  ]);
  mockIsPgReady.mockReturnValue(true);
  mockIsNeo4jReady.mockReturnValue(true);
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
