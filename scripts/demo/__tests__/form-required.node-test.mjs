import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// #2335 (UX-11) — every demo form inserts into `feedback`, whose `category`
// column is NOT NULL, so the field must say so: the renderer prints
// "(optional)" for any field without `required: true`.
test("every seeded form's category field is required", () => {
  const found = [];
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      // A form field has a label; a set-parameter rule does not.
      if (
        typeof n.label === "string" &&
        typeof n.parameterName === "string" &&
        /category$/.test(n.parameterName)
      ) {
        found.push(n);
      }
      Object.values(n).forEach(walk);
    }
  };
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
    walk(JSON.parse(readFileSync(path.join(DIR, f), "utf8")));
  }
  assert.deepEqual(
    found.map((f) => f.parameterName).sort((a, b) => a.localeCompare(b)),
    ["category", "pg_category", "rf1_category", "rf2_category"],
  );
  for (const f of found) {
    assert.equal(f.required, true, `${f.parameterName} must be required`);
  }
});
