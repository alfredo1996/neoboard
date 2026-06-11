import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/docker.js", () => ({
  composeUp: vi.fn(),
  isPgReady: vi.fn(() => true),
  isNeo4jReady: vi.fn(() => true),
  isAppReady: vi.fn(() => true),
}));

vi.mock("../../lib/health.js", () => ({
  waitForHealth: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  readProjectConfig: vi.fn(() => ({
    ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
  })),
  getMode: vi.fn(() => "docker"),
}));

vi.mock("../../lib/output.js", () => ({
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  banner: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../commands/doctor.js", () => ({
  runDoctor: vi.fn(async () => []),
  printResults: vi.fn(() => false),
}));

vi.mock("../../commands/db/migrate.js", () => ({
  runDbMigrate: vi.fn(),
}));

import { composeUp } from "../../lib/docker.js";
import { waitForHealth } from "../../lib/health.js";
import { getMode } from "../../lib/config.js";
import { banner, error } from "../../lib/output.js";
import { printResults } from "../../commands/doctor.js";
import { runDbMigrate } from "../../commands/db/migrate.js";
import { runStart } from "../../commands/start.js";

const mockComposeUp = vi.mocked(composeUp);
const mockWaitForHealth = vi.mocked(waitForHealth);
const mockPrintResults = vi.mocked(printResults);
const mockRunDbMigrate = vi.mocked(runDbMigrate);
const mockGetMode = vi.mocked(getMode);
const mockBanner = vi.mocked(banner);
const mockError = vi.mocked(error);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMode.mockReturnValue("docker");
  mockPrintResults.mockReturnValue(false);
  process.exitCode = 0;
});

describe("runStart", () => {
  it("runs doctor checks first", async () => {
    await runStart();
    expect(printResults).toHaveBeenCalled();
  });

  it("aborts if doctor finds failures", async () => {
    mockPrintResults.mockReturnValue(true);
    await runStart();
    expect(mockComposeUp).not.toHaveBeenCalled();
  });

  it("starts DB containers (not full stack) in docker mode", async () => {
    await runStart();
    expect(mockComposeUp).toHaveBeenCalledWith({ full: false });
  });

  it("skips composeUp in local mode", async () => {
    mockGetMode.mockReturnValue("local");
    await runStart();
    expect(mockComposeUp).not.toHaveBeenCalled();
  });

  it("waits for health checks", async () => {
    await runStart();
    expect(mockWaitForHealth).toHaveBeenCalledTimes(2);
  });

  it("runs migrations after health checks pass", async () => {
    await runStart();
    expect(mockRunDbMigrate).toHaveBeenCalledWith({});
  });

  it("polls app readiness when full=true (docker mode)", async () => {
    await runStart({ full: true });
    // PG + Neo4j + app = 3 health waits when running full stack
    expect(mockWaitForHealth).toHaveBeenCalledTimes(3);
    const labels = mockWaitForHealth.mock.calls.map((c) => c[0].label);
    expect(labels).toContain("NeoBoard app");
  });

  it("does NOT poll app readiness when full=false (DBs only)", async () => {
    await runStart({ full: false });
    expect(mockWaitForHealth).toHaveBeenCalledTimes(2);
    const labels = mockWaitForHealth.mock.calls.map((c) => c[0].label);
    expect(labels).not.toContain("NeoBoard app");
  });

  it("does NOT poll app readiness in local mode even if full=true", async () => {
    mockGetMode.mockReturnValue("local");
    await runStart({ full: true });
    const labels = mockWaitForHealth.mock.calls.map((c) => c[0].label);
    expect(labels).not.toContain("NeoBoard app");
  });

  it("banner includes Stop: and Logs: follow-up commands", async () => {
    await runStart();
    expect(mockBanner).toHaveBeenCalledTimes(1);
    const lines = mockBanner.mock.calls[0][0];
    expect(lines.some((l) => l.startsWith("Stop:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Logs:"))).toBe(true);
  });

  it("DB-only Docker mode shows 'neoboard start --full' hint, not 'dev' (#968)", async () => {
    // getMode is "docker" by default in this suite's beforeEach.
    await runStart({ full: false });
    const lines = mockBanner.mock.calls[0][0];
    expect(lines[0]).toBe("Databases are ready!");
    expect(lines.some((l) => l.includes("neoboard start --full"))).toBe(true);
    expect(lines.some((l) => l.includes("http://localhost:3000"))).toBe(false);
  });

  it("full mode shows 'NeoBoard is running!' and app URL", async () => {
    await runStart({ full: true });
    const lines = mockBanner.mock.calls[0][0];
    expect(lines[0]).toBe("NeoBoard is running!");
    expect(lines.some((l) => l.includes("http://localhost:3000"))).toBe(true);
    expect(lines.some((l) => l.includes("neoboard dev"))).toBe(false);
  });

  it("local mode shows 'Databases are ready!' (app not started by start)", async () => {
    mockGetMode.mockReturnValue("local");
    await runStart();
    const lines = mockBanner.mock.calls[0][0];
    expect(lines[0]).toBe("Databases are ready!");
    expect(lines.some((l) => l.includes("neoboard dev"))).toBe(true);
  });

  it("on healthcheck timeout in docker mode, prints error+hints and exits 1", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockWaitForHealth.mockRejectedValueOnce(
      new Error("Timeout waiting for PG"),
    );

    await runStart();

    expect(mockError).toHaveBeenCalledWith("PostgreSQL failed to start");
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("neoboard logs -f");
    expect(logged).toContain("neoboard doctor");
    expect(process.exitCode).toBe(1);
    // No banner should have been printed on failure
    expect(mockBanner).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it("on app healthcheck timeout, prints app-specific error+hints", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // PG and Neo4j succeed, app fails
    mockWaitForHealth
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Timeout waiting for app"));

    await runStart({ full: true });

    expect(mockError).toHaveBeenCalledWith("NeoBoard app failed to start");
    expect(process.exitCode).toBe(1);
    expect(mockBanner).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it("returns true when everything starts", async () => {
    await expect(runStart({ full: true })).resolves.toBe(true);
  });

  it("returns false when a healthcheck times out", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockWaitForHealth.mockRejectedValueOnce(new Error("Timeout"));
    await expect(runStart()).resolves.toBe(false);
    logSpy.mockRestore();
  });

  it("returns false when doctor finds failures in docker mode", async () => {
    mockPrintResults.mockReturnValue(true);
    await expect(runStart()).resolves.toBe(false);
  });
});
