import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/docker.js", () => ({
  composeUp: vi.fn(),
  isPgReady: vi.fn(() => true),
  isNeo4jReady: vi.fn(() => true),
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
import { printResults } from "../../commands/doctor.js";
import { runDbMigrate } from "../../commands/db/migrate.js";
import { runStart } from "../../commands/start.js";

const mockComposeUp = vi.mocked(composeUp);
const mockWaitForHealth = vi.mocked(waitForHealth);
const mockPrintResults = vi.mocked(printResults);
const mockRunDbMigrate = vi.mocked(runDbMigrate);
const mockGetMode = vi.mocked(getMode);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMode.mockReturnValue("docker");
  mockPrintResults.mockReturnValue(false);
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
});
