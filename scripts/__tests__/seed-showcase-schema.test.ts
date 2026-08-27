import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { neoboardExportSchema } from "../../app/src/lib/dashboard/dashboard-import";
import { SHOWCASES } from "../demo/showcases.mjs";

/**
 * #1515 — demo content, validated against the schema the app actually enforces.
 *
 * `scripts/demo/import-dashboard.mjs` validates the same files at seed time,
 * but against its own hand-mirrored copy of the schema, and only when someone
 * runs the demo. This is the check that runs on every `npm run verify`, and
 * the only one that uses the app's real schema — a plain ESM script cannot
 * import the TypeScript module, but a test can.
 *
 * This replaces `scripts/validate-seed-data.ts`, which was dead from
 * 2026-04-07: it imported `app/src/lib/dashboard-import`, which #438 moved to
 * `app/src/lib/dashboard/dashboard-import`, and built its subjects from eight
 * `buildX` exports that `seed-demo.mjs` dropped when demo content moved to
 * JSON showcases. It also ran in no npm script and no CI job, so nothing
 * reported that it had stopped working — which is why the demo drifted
 * undetected for four months.
 *
 * Living here rather than as a revived script is deliberate: `test:scripts`
 * already runs `scripts/__tests__` inside `npm run verify`, so this needs no
 * bespoke npm script and no CI wiring to rot again.
 */

function readShowcase(jsonPath: string): unknown {
  return JSON.parse(readFileSync(jsonPath, "utf-8"));
}

describe("demo showcases validate against the app's export schema", () => {
  // Guards the sweep itself: an empty manifest would make the per-showcase
  // tests below vanish, and a suite that generates no cases passes.
  it("has showcases to check", () => {
    expect(SHOWCASES.length).toBeGreaterThan(0);
  });

  for (const showcase of SHOWCASES) {
    describe(showcase.key, () => {
      it("has a readable jsonPath", () => {
        // Catches a manifest entry pointing at a deleted or renamed file —
        // exactly the drift this suite exists for.
        expect(() => readFileSync(showcase.jsonPath, "utf-8")).not.toThrow();
      });

      it("is valid JSON", () => {
        expect(() => readShowcase(showcase.jsonPath)).not.toThrow();
      });

      it("matches neoboardExportSchema", () => {
        const result = neoboardExportSchema.safeParse(
          readShowcase(showcase.jsonPath),
        );
        // Name the offending paths — "Invalid input" alone is not actionable
        // against a 156KB showcase file.
        const detail = result.success
          ? ""
          : result.error.issues
              .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("\n");
        expect(result.success, detail).toBe(true);
      });
    });
  }
});

describe("the schema check itself is wired up", () => {
  // The predecessor script was correct and did nothing, because its import
  // target had moved and nothing ran it. Both halves are asserted here so the
  // next module move breaks a test rather than rotting silently.
  it("can import the app's export schema", () => {
    expect(typeof neoboardExportSchema.safeParse).toBe("function");
  });

  it("rejects a layout the app would reject", () => {
    const valid = readShowcase(SHOWCASES[0].jsonPath) as Record<
      string,
      unknown
    >;

    // Missing `pages` — the shape every consumer iterates.
    expect(
      neoboardExportSchema.safeParse({ ...valid, layout: { version: 2 } })
        .success,
    ).toBe(false);

    // Missing the dashboard envelope entirely.
    const withoutDashboard = { ...valid };
    delete withoutDashboard.dashboard;
    expect(neoboardExportSchema.safeParse(withoutDashboard).success).toBe(
      false,
    );

    // Not an object at all.
    expect(neoboardExportSchema.safeParse("nope").success).toBe(false);
  });
});
