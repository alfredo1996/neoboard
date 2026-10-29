import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// #2331 — the month-over-month trend compared the partial current month with
// the last full one, so it read -93% early in a month.
test("the trend widget compares complete months only", () => {
  const json = JSON.parse(
    readFileSync(path.join(DIR, "chart-reference.json"), "utf8"),
  );
  let query;
  (function walk(n) {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      if (n.id === "page-single-value-v-81") query = n.query;
      Object.values(n).forEach(walk);
    }
  })(json);
  assert.ok(query, "widget exists");
  assert.match(query, /WHERE created_at < date_trunc\('month', NOW\(\)\)/);
});
