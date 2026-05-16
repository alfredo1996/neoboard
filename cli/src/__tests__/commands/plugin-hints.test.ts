import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Mock the CLI plumbing that runPluginAdd touches. We only care about the
// hint-printing paths added in #799 — `info()` calls that follow a
// missing-export error or a validator error with a known hint rule.
vi.mock("../../lib/exec.js", () => ({ run: vi.fn() }));

vi.mock("../../lib/config.js", () => ({
  findProjectRoot: vi.fn(() => "/project"),
}));

const outputMocks = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  createSpinner: vi.fn(() => ({
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));
vi.mock("../../lib/output.js", () => outputMocks);

vi.mock("../../lib/manifest.js", () => ({
  readManifest: vi.fn(() => ({})),
  addToManifest: vi.fn(() => true),
  removeFromManifest: vi.fn(() => true),
}));

const validatorMock = vi.hoisted(() => ({
  validatePluginExport: vi.fn(),
}));
vi.mock("../../lib/plugin-validator.js", () => validatorMock);

// We exercise runPluginAdd via real on-disk ESM fixtures rather than vi.mock —
// vitest 4's strict mock guard throws on `mod[unknownExport]` access, which
// would short-circuit the missing-export hint branch we want to cover.
import { runPluginAdd } from "../../commands/plugin.js";

let tmpRoot: string;
let missingDefaultPkg: string;
let validPkg: string;

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "plugin-hint-test-"));

  // Fixture: a package with named exports but no `default` and no `doesNotExist`.
  missingDefaultPkg = join(tmpRoot, "missing-default.mjs");
  writeFileSync(
    missingDefaultPkg,
    `export const myChart = { type: "chart-x" };\nexport const helper = () => {};\n`,
  );

  // Fixture: a package whose default export is shaped however we want — the
  // validator is mocked, so the runtime shape doesn't matter beyond being truthy.
  validPkg = join(tmpRoot, "valid.mjs");
  writeFileSync(validPkg, `export default { type: "anything" };\n`);
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// runPluginAdd accepts `packageName` as the import specifier. Passing a
// file:// URL works because Node's loader treats it as an absolute module.
const fileUrl = (p: string) => pathToFileURL(p).href;

describe("runPluginAdd — validator hint integration (#799)", () => {
  it("prints an --export hint when the requested export is missing", async () => {
    await runPluginAdd(fileUrl(missingDefaultPkg), {
      export: "doesNotExist",
    });

    expect(outputMocks.error).toHaveBeenCalledWith(
      expect.stringContaining('"doesNotExist" export'),
    );
    // Hint should list the package's actual exports — at least "myChart"
    // should appear so the user can see what `--export` value to try.
    const hintCall = outputMocks.info.mock.calls.find(
      (c) =>
        String(c[0]).includes("--export") && String(c[0]).includes("myChart"),
    );
    expect(hintCall).toBeDefined();
  });

  it("prints a hint for each validator error matching a known rule", async () => {
    validatorMock.validatePluginExport.mockReturnValue({
      valid: false,
      errors: ['"type" must be a non-empty string'],
    });

    await runPluginAdd(fileUrl(validPkg));

    expect(outputMocks.error).toHaveBeenCalledWith(
      expect.stringContaining("not a valid NeoBoard plugin"),
    );
    expect(outputMocks.error).toHaveBeenCalledWith(
      expect.stringContaining('"type" must be a non-empty string'),
    );
    // The arrow-prefixed hint comes from hintForValidatorError.
    const hintCall = outputMocks.info.mock.calls.find(
      (c) => String(c[0]).includes("→") && String(c[0]).includes("Add `type:"),
    );
    expect(hintCall).toBeDefined();
  });

  it("stays silent when the validator error has no matching rule", async () => {
    validatorMock.validatePluginExport.mockReturnValue({
      valid: false,
      errors: ["some unrecognised validation problem"],
    });

    await runPluginAdd(fileUrl(validPkg));

    const hintCalls = outputMocks.info.mock.calls.filter((c) =>
      String(c[0]).includes("→"),
    );
    expect(hintCalls).toHaveLength(0);
  });
});
