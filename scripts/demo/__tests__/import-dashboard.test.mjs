import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  neoboardExportSchema,
  applyConnectionMapping,
  importShowcase,
} from "../import-dashboard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");

// ---------------------------------------------------------------------------
// Schema drift test (R1) — keeps scripts/demo/import-dashboard.mjs aligned
// with app/src/lib/dashboard/dashboard-import.ts. Updates on one side must
// be mirrored on the other.
// ---------------------------------------------------------------------------

describe("schema drift between app/ and scripts/demo/", () => {
  it("every top-level key in dashboard-import.ts appears in import-dashboard.mjs", () => {
    const appSchemaPath = resolve(
      repoRoot,
      "app",
      "src",
      "lib",
      "dashboard",
      "dashboard-import.ts",
    );
    const appSrc = readFileSync(appSchemaPath, "utf8");
    const mjsSrc = readFileSync(
      resolve(__dirname, "..", "import-dashboard.mjs"),
      "utf8",
    );

    // Sentinels we expect to see in BOTH files. If any of these move or
    // rename in dashboard-import.ts, the drift test fails until the mjs
    // copy is updated.
    const sentinels = [
      "stylingRuleSchema",
      "stylingConfigSchema",
      "conditionalFormattingSchema",
      "CHART_OPTION_KEYS",
      "widgetSettingsSchema",
      "widgetSchema",
      "gridLayoutItemSchema",
      "pageSchema",
      "dashboardLayoutSchema",
      "neoboardExportSchema",
    ];
    for (const name of sentinels) {
      assert.ok(
        appSrc.includes(name),
        `${name} missing from dashboard-import.ts — drift test sentinel is stale`,
      );
      assert.ok(
        mjsSrc.includes(name),
        `${name} missing from import-dashboard.mjs — update the mjs copy`,
      );
    }
  });

  it("CHART_OPTION_KEYS set matches between the two files", () => {
    const appSchemaPath = resolve(
      repoRoot,
      "app",
      "src",
      "lib",
      "dashboard",
      "dashboard-import.ts",
    );
    const appSrc = readFileSync(appSchemaPath, "utf8");
    const mjsSrc = readFileSync(
      resolve(__dirname, "..", "import-dashboard.mjs"),
      "utf8",
    );
    const extractKeys = (src) => {
      const match = src.match(/CHART_OPTION_KEYS\s*=\s*new Set\(\[([^\]]*)\]/);
      assert.ok(match, "CHART_OPTION_KEYS block not found");
      return new Set(
        match[1]
          .split(",")
          .map((s) => s.trim().replace(/['"]/g, ""))
          .filter(Boolean),
      );
    };
    const appKeys = extractKeys(appSrc);
    const mjsKeys = extractKeys(mjsSrc);
    const missing = [...appKeys].filter((k) => !mjsKeys.has(k));
    const extra = [...mjsKeys].filter((k) => !appKeys.has(k));
    assert.deepEqual(
      { missing, extra },
      { missing: [], extra: [] },
      "CHART_OPTION_KEYS drift — align scripts/demo/import-dashboard.mjs with app/src/lib/dashboard/dashboard-import.ts",
    );
  });
});

// ---------------------------------------------------------------------------
// Functional tests
// ---------------------------------------------------------------------------

function minimalValidExport(overrides = {}) {
  return {
    formatVersion: 1,
    exportedAt: "2026-04-15T00:00:00.000Z",
    dashboard: { name: "Test" },
    connections: { conn_a: { name: "A", type: "postgresql" } },
    layout: {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [],
          gridLayout: [],
        },
      ],
    },
    ...overrides,
  };
}

describe("neoboardExportSchema", () => {
  it("accepts a minimal valid export", () => {
    const result = neoboardExportSchema.safeParse(minimalValidExport());
    assert.equal(result.success, true);
  });

  it("rejects when formatVersion is not 1", () => {
    const bad = minimalValidExport({ formatVersion: 2 });
    assert.equal(neoboardExportSchema.safeParse(bad).success, false);
  });

  it("rejects when layout.version is not 2", () => {
    const bad = minimalValidExport({
      layout: {
        version: 1,
        pages: [],
      },
    });
    assert.equal(neoboardExportSchema.safeParse(bad).success, false);
  });

  it("rejects when a chart option lives at settings root instead of chartOptions", () => {
    const bad = minimalValidExport({
      layout: {
        version: 2,
        pages: [
          {
            id: "p1",
            title: "Page 1",
            widgets: [
              {
                id: "w1",
                chartType: "bar",
                connectionId: "conn_a",
                query: "SELECT 1",
                settings: { colorPalette: "deep-ocean" },
              },
            ],
            gridLayout: [],
          },
        ],
      },
    });
    const result = neoboardExportSchema.safeParse(bad);
    assert.equal(result.success, false);
  });
});

describe("applyConnectionMapping", () => {
  it("rewrites widget.connectionId from portable keys", () => {
    const layout = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            {
              id: "w1",
              chartType: "bar",
              connectionId: "conn_a",
              query: "SELECT 1",
            },
          ],
          gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 4 }],
        },
      ],
    };
    const mapped = applyConnectionMapping(layout, { conn_a: "real-id-123" });
    assert.equal(mapped.pages[0].widgets[0].connectionId, "real-id-123");
  });

  it("throws when a widget references an unknown portable key", () => {
    const layout = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            {
              id: "w1",
              chartType: "bar",
              connectionId: "conn_missing",
              query: "SELECT 1",
            },
          ],
          gridLayout: [],
        },
      ],
    };
    assert.throws(
      () => applyConnectionMapping(layout, { conn_a: "real-id-123" }),
      /Unknown portable connection key "conn_missing"/,
    );
  });

  it("leaves layout immutable — original input untouched", () => {
    const layout = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            {
              id: "w1",
              chartType: "bar",
              connectionId: "conn_a",
              query: "SELECT 1",
            },
          ],
          gridLayout: [],
        },
      ],
    };
    const before = JSON.stringify(layout);
    applyConnectionMapping(layout, { conn_a: "real-id-123" });
    assert.equal(JSON.stringify(layout), before);
  });
});

describe("importShowcase", () => {
  async function run(exportDoc, connectionMap = { conn_a: "real-id" }) {
    // Write to a temp file so importShowcase's readFileSync path works.
    const tmpPath = resolve(
      __dirname,
      `fixtures-${process.pid}-${Math.random().toString(36).slice(2)}.json`,
    );
    const { writeFileSync, rmSync } = await import("node:fs");
    writeFileSync(tmpPath, JSON.stringify(exportDoc));

    const calls = [];
    const fakeUpsert = async (_sql, userId, name, description, layout) => {
      calls.push({ userId, name, description, layout });
      return "dash-id";
    };
    const fakePatch = (layout) => {
      // no-op for these tests
      return layout;
    };
    try {
      const id = await importShowcase({
        jsonPath: tmpPath,
        adminId: "admin-xyz",
        connectionMap,
        upsertDashboard: fakeUpsert,
        patchGridIds: fakePatch,
        sql: null,
      });
      return { id, calls };
    } finally {
      rmSync(tmpPath, { force: true });
    }
  }

  it("resolves portable conn keys and calls upsertDashboard", async () => {
    const doc = minimalValidExport({
      layout: {
        version: 2,
        pages: [
          {
            id: "p1",
            title: "Page 1",
            widgets: [
              {
                id: "w1",
                chartType: "bar",
                connectionId: "conn_a",
                query: "SELECT 1",
              },
            ],
            gridLayout: [],
          },
        ],
      },
    });
    const { id, calls } = await run(doc);
    assert.equal(id, "dash-id");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "Test");
    assert.equal(calls[0].layout.pages[0].widgets[0].connectionId, "real-id");
  });

  it("rejects an unknown chartType with a semantic error", async () => {
    const doc = minimalValidExport({
      layout: {
        version: 2,
        pages: [
          {
            id: "p1",
            title: "Page 1",
            widgets: [
              {
                id: "w1",
                chartType: "pretend-chart",
                connectionId: "conn_a",
                query: "SELECT 1",
              },
            ],
            gridLayout: [],
          },
        ],
      },
    });
    await assert.rejects(run(doc), /unknown chartType "pretend-chart"/);
  });

  it("rejects an unknown clickAction type", async () => {
    const doc = minimalValidExport({
      layout: {
        version: 2,
        pages: [
          {
            id: "p1",
            title: "Page 1",
            widgets: [
              {
                id: "w1",
                chartType: "bar",
                connectionId: "conn_a",
                query: "SELECT 1",
                settings: {
                  clickAction: { type: "open-url" },
                },
              },
            ],
            gridLayout: [],
          },
        ],
      },
    });
    await assert.rejects(run(doc), /unknown clickAction\.type "open-url"/);
  });

  it("rejects an unknown transform type", async () => {
    const doc = minimalValidExport({
      layout: {
        version: 2,
        pages: [
          {
            id: "p1",
            title: "Page 1",
            widgets: [
              {
                id: "w1",
                chartType: "bar",
                connectionId: "conn_a",
                query: "SELECT 1",
                settings: {
                  transforms: [{ type: "pivot" }],
                },
              },
            ],
            gridLayout: [],
          },
        ],
      },
    });
    await assert.rejects(run(doc), /unknown transform type "pivot"/);
  });

  it("wraps JSON parse errors with the file path", async () => {
    const tmpPath = resolve(
      __dirname,
      `fixtures-${process.pid}-bad.json`,
    );
    const { writeFileSync, rmSync } = await import("node:fs");
    writeFileSync(tmpPath, "{ not valid json");
    try {
      await assert.rejects(
        importShowcase({
          jsonPath: tmpPath,
          adminId: "admin",
          connectionMap: {},
          upsertDashboard: async () => "x",
          patchGridIds: () => {},
          sql: null,
        }),
        /invalid JSON/,
      );
    } finally {
      rmSync(tmpPath, { force: true });
    }
  });
});
