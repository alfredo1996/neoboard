/**
 * Test-environment boundary guard.
 *
 * `vitest.config.ts` splits app tests into two projects by file extension:
 *
 *   - `unit`      — `*.test.ts`,  environment "node", **no setupFiles**
 *   - `component` — `*.test.tsx`, environment "jsdom", setupFiles vitest.setup.tsx
 *
 * Only the `component` project gets `vitest.setup.tsx`, and that is the only
 * place `afterEach(() => cleanup())` is registered. So a `*.test.ts` file that
 * opts into jsdom with a `// @vitest-environment jsdom` docblock renders React
 * into a document that is never unmounted.
 *
 * That leak is invisible until it isn't. React's scheduler keeps a callback
 * queued; vitest tears the jsdom environment down when the file finishes; if
 * the callback fires after the teardown it throws `ReferenceError: window is
 * not defined` from `performWorkOnRootViaSchedulerTask`. Vitest reports it as
 * an unhandled error and exits non-zero **with every test passing**, and
 * attributes it to whichever file happened to be running — not the one that
 * leaked. Whether it lands is a race, so it reproduces on CI and not locally.
 *
 * Seven hook tests were in exactly this state. The fix was to name them
 * `.test.tsx` so they run in the `component` project and get cleanup; this
 * test is here so the next one fails fast and legibly instead.
 *
 * If this fails: rename your file to `.test.tsx` and drop the docblock. Do not
 * add an allowlist entry — the `unit` project has no DOM by design (.claude/CLAUDE.md,
 * "Testing Boundaries").
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function nodeProjectTestFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      nodeProjectTestFiles(full, acc);
    } else if (entry.endsWith(".test.ts")) {
      // `.test.ts` only — `.test.tsx` is the jsdom project and is fine.
      acc.push(full);
    }
  }
  return acc;
}

describe("test environment boundary", () => {
  const files = nodeProjectTestFiles(APP_SRC);

  it("finds the node-project test files it is meant to police", () => {
    // Guards against the walk silently matching nothing (a passing no-op).
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no *.test.ts that opts into jsdom or renders React", () => {
    const self = fileURLToPath(import.meta.url);
    const offenders = files
      // This file quotes both needles in its own docs, so it matches itself.
      .filter((f) => f !== self)
      .map((f) => ({
        file: relative(APP_SRC, f),
        src: readFileSync(f, "utf8"),
      }))
      .filter(
        ({ src }) =>
          src.includes("@vitest-environment jsdom") ||
          src.includes("@testing-library/react"),
      )
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});
