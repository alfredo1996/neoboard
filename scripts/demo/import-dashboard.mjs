/**
 * Shared JSON-to-DB helper for demo showcases.
 *
 * Reads a showcase JSON file, validates it against a local copy of
 * `neoboardExportSchema`, rewrites the portable `conn_*` keys to the
 * real connection IDs passed by the caller, and inserts/updates the
 * dashboard row.
 *
 * IMPORTANT — schema duplication:
 *   This file hosts a copy of the export schema mirroring
 *   `app/src/lib/dashboard/dashboard-import.ts`. We cannot import the
 *   TypeScript module directly from a plain ESM script, and building
 *   the app just for seeding is overkill.
 *
 *   Nothing compares the two schemas directly. This comment previously
 *   claimed a `__tests__/schema-drift.test.mjs` did, and failed CI on any
 *   divergence — that file has never existed (#1515).
 *
 *   What does exist: `scripts/__tests__/seed-showcase-schema.test.ts`
 *   validates every showcase against the APP's schema on each
 *   `npm run verify`. So drift is caught wherever the shipped demo content
 *   actually exercises it — which is the case that matters — but a
 *   divergence in a branch no showcase uses will still pass unnoticed.
 */

import { createRequire } from "module";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, "../../app/") + "/");
const { z } = require("zod");

// ---------------------------------------------------------------------------
// Export schema (mirror of app/src/lib/dashboard/dashboard-import.ts)
// ---------------------------------------------------------------------------

const stylingRuleSchema = z.object({
  id: z.string(),
  column: z.string().optional(),
  operator: z.string(),
  value: z.union([z.number(), z.string()]),
  valueTo: z.union([z.number(), z.string()]).optional(),
  parameterRef: z.string().optional(),
  parameterRefTo: z.string().optional(),
  color: z.string(),
  target: z.enum(["color", "backgroundColor", "textColor"]).optional(),
  bold: z.boolean().optional(),
});

const stylingConfigSchema = z.object({
  enabled: z.boolean(),
  rules: z.array(stylingRuleSchema),
});

const colorScaleSchema = z.object({
  column: z.string(),
  minColor: z.string(),
  maxColor: z.string(),
});

const conditionalFormattingSchema = z.object({
  colorScales: z.array(colorScaleSchema).optional(),
});

const CHART_OPTION_KEYS = new Set([
  "colorPalette",
  "colorblindMode",
  "donut",
  "smooth",
  "area",
  "stacked",
  "showValues",
  "showLegend",
  "showLabels",
  "enableSorting",
  "enablePagination",
  "pageSize",
  "orientation",
  "barWidth",
  "barGap",
  "labelPosition",
  "filled",
  "shape",
  "enableGrouping",
  "groupBy",
  "aggregationFn",
  "enableColumnResizing",
  "enableGlobalFilter",
  "enableColumnFilters",
  "enableSelection",
]);

const widgetSettingsSchema = z
  .object({
    stylingConfig: stylingConfigSchema.optional(),
    conditionalFormatting: conditionalFormattingSchema.optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    for (const key of Object.keys(val)) {
      if (CHART_OPTION_KEYS.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${key}" should be inside settings.chartOptions, not at the settings root`,
          path: [key],
        });
      }
    }
  });

const widgetSchema = z
  .object({
    id: z.string(),
    chartType: z.string(),
    connectionId: z.string(),
    query: z.string(),
    settings: widgetSettingsSchema.optional(),
  })
  .passthrough();

const gridLayoutItemSchema = z
  .object({
    i: z.string(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  })
  .passthrough();

const pageSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    widgets: z.array(widgetSchema),
    gridLayout: z.array(gridLayoutItemSchema),
  })
  .passthrough();

const dashboardLayoutSchema = z
  .object({
    version: z.literal(2),
    pages: z.array(pageSchema),
    settings: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const neoboardExportSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  dashboard: z.object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
  }),
  connections: z.record(
    z.object({
      name: z.string(),
      type: z.string(),
    }),
  ),
  layout: dashboardLayoutSchema,
});

// ---------------------------------------------------------------------------
// Second-pass validation — settings.passthrough() lets bad click actions +
// unknown chart types slip through Zod. Catch them explicitly here.
// ---------------------------------------------------------------------------

const KNOWN_CHART_TYPES = new Set([
  "bar",
  "line",
  "pie",
  "table",
  "single-value",
  "graph",
  "map",
  "json",
  "parameter-select",
  "form",
  "markdown",
  "iframe",
  "gauge",
  "sankey",
  "sunburst",
  "radar",
  "treemap",
  "gantt",
  "circle-packing",
  "choropleth",
]);

const KNOWN_CLICK_ACTION_TYPES = new Set([
  "set-parameter",
  "navigate-to-page",
  "set-parameter-and-navigate",
]);

const KNOWN_TRANSFORM_TYPES = new Set([
  "filter",
  "sort",
  "groupBy",
  "calculatedColumn",
  "renameColumns",
  "limit",
]);

function validateWidgetsSemantics(layout, filePath) {
  const errors = [];
  for (const page of layout.pages) {
    for (const widget of page.widgets ?? []) {
      if (!KNOWN_CHART_TYPES.has(widget.chartType)) {
        errors.push(
          `${filePath}: widget "${widget.id}" on page "${page.title}" uses unknown chartType "${widget.chartType}"`,
        );
      }
      const clickAction = widget.settings?.clickAction ?? widget.clickAction;
      if (clickAction?.type && !KNOWN_CLICK_ACTION_TYPES.has(clickAction.type)) {
        errors.push(
          `${filePath}: widget "${widget.id}" has unknown clickAction.type "${clickAction.type}"`,
        );
      }
      const transforms = widget.settings?.transforms ?? [];
      if (Array.isArray(transforms)) {
        for (const t of transforms) {
          if (!KNOWN_TRANSFORM_TYPES.has(t.type)) {
            errors.push(
              `${filePath}: widget "${widget.id}" has unknown transform type "${t.type}"`,
            );
          }
        }
      }
    }
  }
  if (errors.length > 0) {
    throw new Error("Semantic validation failed:\n  " + errors.join("\n  "));
  }
}

// ---------------------------------------------------------------------------
// Connection-id rewriting
// ---------------------------------------------------------------------------

/**
 * Rewrites every `widget.connectionId` using the given portable-key map.
 * Returns a fresh layout — does not mutate the input.
 */
export function applyConnectionMapping(layout, mapping) {
  return {
    ...layout,
    pages: layout.pages.map((page) => ({
      ...page,
      widgets: page.widgets.map((widget) => {
        const mapped = mapping[widget.connectionId];
        if (widget.connectionId && mapped === undefined) {
          throw new Error(
            `Unknown portable connection key "${widget.connectionId}" — valid keys: ${Object.keys(mapping).join(", ")}`,
          );
        }
        return { ...widget, connectionId: mapped ?? widget.connectionId };
      }),
      gridLayout: page.gridLayout.map((item) => ({ ...item })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Top-level helper used by seed-demo.mjs
// ---------------------------------------------------------------------------

/**
 * Reads + validates a showcase JSON file and inserts it through the
 * caller-supplied `upsertDashboard` function.
 *
 * @param {object} args
 * @param {string} args.jsonPath       Path to a `scripts/demo/*.json` file
 * @param {string} args.adminId        User id to own the dashboard
 * @param {Record<string,string>} args.connectionMap  Portable key → real conn id
 * @param {Function} args.upsertDashboard  From seed-demo.mjs — `(sql, userId, name, description, layout, isPublic)`
 * @param {Function} args.patchGridIds     From seed-demo.mjs
 * @param {object} args.sql            postgres client
 * @returns {Promise<string>} the dashboard id
 */
export async function importShowcase({
  jsonPath,
  adminId,
  connectionMap,
  upsertDashboard,
  patchGridIds,
  sql,
}) {
  const raw = readFileSync(jsonPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${jsonPath}: invalid JSON — ${err.message}`);
  }

  const validation = neoboardExportSchema.safeParse(parsed);
  if (!validation.success) {
    const summary = validation.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`${jsonPath}: schema validation failed\n${summary}`);
  }

  validateWidgetsSemantics(validation.data.layout, jsonPath);

  const layout = applyConnectionMapping(validation.data.layout, connectionMap);
  patchGridIds(layout);

  return upsertDashboard(
    sql,
    adminId,
    validation.data.dashboard.name,
    validation.data.dashboard.description ?? null,
    layout,
    true,
  );
}
