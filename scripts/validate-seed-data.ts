#!/usr/bin/env npx tsx
/**
 * Validates seed-demo dashboard layouts against the app's Zod schemas.
 *
 * Run: npx tsx scripts/validate-seed-data.ts
 *
 * This catches schema drift — if the app's widget types change but the seed
 * data isn't updated, validation fails with a clear error.
 */

import { dashboardLayoutSchema } from "../app/src/lib/dashboard-import";

const seedModule = await import("./seed-demo.mjs");

const DUMMY = "conn-test";

const dashboards: { name: string; build: () => unknown }[] = [
  { name: "Widget Showcase", build: () => seedModule.buildWidgetShowcase(DUMMY, DUMMY) },
  { name: "Table Features", build: () => seedModule.buildTableFeatures(DUMMY, DUMMY) },
  { name: "Parameter Testing", build: () => seedModule.buildParameterTesting(DUMMY, DUMMY) },
  { name: "Form Testing", build: () => seedModule.buildFormTesting(DUMMY, DUMMY) },
  { name: "Click Action Demo", build: () => seedModule.buildClickActionDemo(DUMMY, DUMMY) },
  { name: "Styling Rules Demo", build: () => seedModule.buildStylingRulesDemo(DUMMY, DUMMY) },
  { name: "Chart Improvements", build: () => seedModule.buildChartImprovements(DUMMY) },
  { name: "Chart Catalog", build: () => seedModule.buildChartCatalog(DUMMY) },
];

let hasErrors = false;

for (const { name, build } of dashboards) {
  try {
    const layout = build();
    // Patch grid IDs (same as seed script does before insert)
    const l = layout as { pages: { widgets: { id: string }[]; gridLayout: { i: string | null }[] }[] };
    for (const page of l.pages) {
      for (let idx = 0; idx < page.gridLayout.length; idx++) {
        if (idx < page.widgets.length) {
          page.gridLayout[idx].i = page.widgets[idx].id;
        }
      }
    }

    const result = dashboardLayoutSchema.safeParse(layout);
    if (result.success) {
      console.log(`  ✓ ${name}`);
    } else {
      hasErrors = true;
      console.error(`  ✗ ${name}`);
      for (const issue of result.error.issues) {
        console.error(`    → ${issue.path.join(".")}: ${issue.message}`);
      }
    }
  } catch (e) {
    hasErrors = true;
    console.error(`  ✗ ${name}: ${(e as Error).message}`);
  }
}

if (hasErrors) {
  console.error("\nSeed data validation FAILED — fix the issues above.");
  process.exit(1);
} else {
  console.log("\nAll seed dashboards valid.");
}
