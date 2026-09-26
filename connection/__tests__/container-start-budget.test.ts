import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { CONTAINER_START_MS } from "./utils/container-start";

// A full run starts several containers at once, and a beforeAll budget sized
// for an idle machine was exceeded by contention alone: all six tests of a
// suite that passes on its own failed on "Exceeded timeout of 30000 ms for a
// hook" (#1944). Every hook that starts a container takes the shared budget.

const ROOT = __dirname;

/** Test sources of the parallel pass: not the helpers, not the serial quality pass. */
function suites(dir = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      return ["utils", "quality"].includes(e.name) ? [] : suites(path);
    }
    return e.name.endsWith(".ts") ? [path] : [];
  });
}

/** The budget of each beforeAll that starts a container, as written. */
function containerHookBudgets(src: string): string[] {
  const budgets: string[] = [];
  let open: { indent: string; starts: boolean } | null = null;
  for (const line of src.split("\n")) {
    const begin = /^(\s*)beforeAll\(/.exec(line);
    if (begin) {
      open = { indent: begin[1], starts: false };
      continue;
    }
    if (!open) continue;
    if (/new \w*Container\(/.test(line)) open.starts = true;
    const end = new RegExp(`^${open.indent}\\}(?:, ([^)]+))?\\);`).exec(line);
    if (end) {
      if (open.starts) budgets.push(end[1] ?? "Jest's default");
      open = null;
    }
  }
  return budgets;
}

describe("container start budget (#1944)", () => {
  const hooks = suites().flatMap((file) =>
    containerHookBudgets(readFileSync(file, "utf8")).map((budget) => ({
      file: relative(ROOT, file),
      budget,
    })),
  );

  it("finds the hooks it guards", () => {
    expect(hooks.length).toBeGreaterThanOrEqual(9);
  });

  it("gives every hook that starts a container the shared budget", () => {
    expect(hooks.filter((h) => h.budget !== "CONTAINER_START_MS")).toEqual([]);
  });

  it("is far above contention yet still fails a start that hangs", () => {
    expect(CONTAINER_START_MS).toBeGreaterThanOrEqual(120_000);
    expect(CONTAINER_START_MS).toBeLessThanOrEqual(180_000);
  });
});
