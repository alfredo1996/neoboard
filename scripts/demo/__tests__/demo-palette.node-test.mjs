import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #2226 — the demo widgets stored `colorPalette: "citrine"` only because the
 * old editor wrote every default into new widgets. The default is Hastings now,
 * so no demo dashboard may pin the old one by accident.
 */
const DEMO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every value stored under a `colorPalette` key, wherever it sits. */
function palettes(node, found = []) {
  if (Array.isArray(node)) node.forEach((n) => palettes(n, found));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "colorPalette") found.push(value);
      else palettes(value, found);
    }
  }
  return found;
}

test("no demo widget stores the old default palette", () => {
  const files = readdirSync(DEMO_DIR).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const json = JSON.parse(readFileSync(path.join(DEMO_DIR, file), "utf8"));
    assert.ok(
      !palettes(json).includes("citrine"),
      `${file} still stores colorPalette "citrine"`,
    );
    // ...and no widget's explanatory text may claim it does.
    assert.ok(
      !JSON.stringify(json).includes("colorPalette: citrine"),
      `${file} text still says colorPalette: citrine`,
    );
  }
});

test("the demo still stores the hastings palette somewhere", () => {
  const all = readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) =>
      palettes(JSON.parse(readFileSync(path.join(DEMO_DIR, f), "utf8"))),
    );
  assert.ok(all.includes("hastings"));
});

// #2331 — the gallery sunburst kept the pre-redesign tableau palette. Find it
// by chart type so a scan for "no citrine" cannot pass with this reverted.
test("the gallery and playground sunbursts use the hastings palette", () => {
  for (const file of ["chart-gallery.json", "chart-playground.json"]) {
    checkType(file, "sunburst");
  }
});

// Owner decision 2026-10-28: the gallery Sankey follows the sunburst.
test("the gallery sankey uses the hastings palette", () => {
  checkType("chart-gallery.json", "sankey");
});

function checkType(file, chartType) {
  const json = JSON.parse(readFileSync(path.join(DEMO_DIR, file), "utf8"));
  const found = [];
  (function walk(n) {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      if (n.chartType === chartType) found.push(n);
      Object.values(n).forEach(walk);
    }
  })(json);
  assert.ok(found.length > 0, `${file} has a ${chartType}`);
  for (const w of found) {
    assert.equal(w.settings?.chartOptions?.colorPalette, "hastings", `${file} ${w.id}`);
  }
}
