import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Ratchet: every option offered in the widget editor must be read by the
 * plugin that advertises it (#1397).
 *
 * Two options — `trendEnabled` (single-value) and `thresholdZones` (gauge) —
 * shipped fully built at both ends and inert in between: present in the editor,
 * implemented in the component library, and never forwarded by the plugin.
 * Setting them did nothing, with no error, and the seeded reference dashboard
 * shipped tiles demonstrating both. A control that lies is worse than a missing
 * one.
 *
 * **Why source text and not the Zod schema.** #1397 proposed asserting that
 * every option key exists in the plugin's `settingsSchema`. That would not have
 * caught either bug: these schemas end in `.passthrough()`, so an unknown key
 * survives the parse untouched — `gaugeSettingsSchema.parse({thresholdZones})`
 * returns it intact. The value died at the plugin's explicit prop mapping,
 * a seam the schema never sees. Conversely a key can be in the schema and still
 * be dropped there. So the check has to be "does the plugin actually read this",
 * and the cheapest honest proxy is a reference in its source.
 *
 * **Why not import `getChartOptions`.** It lives in `@neoboard/components`,
 * whose barrel pulls in `@neo4j-nvl` — a browser-only WebGL dependency that
 * cannot load in the node test environment. Reading the option definitions from
 * source keeps this test fast and dependency-free; the shape it parses is
 * guarded by `finds option keys for every chart type` below, so a refactor that
 * changed it would fail loudly rather than silently pass.
 *
 * This catches "advertised but never wired". It cannot catch "wired but
 * misused" — that needs a per-option behavioural test.
 */

const OPTIONS_DIR = join(
  __dirname,
  "../../../../../component/src/components/composed/chart-options",
);
const PLUGIN_DIR = join(__dirname, "../../../plugins");

/** Files in chart-options/ that describe no chart type. */
const NON_CHART_FILES = new Set(["index", "shared", "validate-iframe-url"]);

function chartTypesWithOptions(): string[] {
  return readdirSync(OPTIONS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => f.slice(0, -3))
    .filter((t) => !NON_CHART_FILES.has(t))
    .filter((t) => existsSync(join(PLUGIN_DIR, t)))
    .sort();
}

function optionKeys(type: string): string[] {
  const src = readFileSync(join(OPTIONS_DIR, `${type}.ts`), "utf8");
  return [...src.matchAll(/^\s*key:\s*"([^"]+)"/gm)].map((m) => m[1]);
}

const APP_SRC = join(__dirname, "../../..");

function readIfPresent(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/**
 * A plugin's source, plus any `@/components/*` module it renders.
 *
 * Several plugins are thin wrappers that hand their settings straight to a
 * shared renderer — `table` → `TableRenderer`, `form` → `FormWidgetRenderer` —
 * and those renderers are where the options are actually read. Without
 * following that one hop, every such plugin reports its entire option list as
 * unforwarded, which is how this check first reported 29 problems where there
 * were far fewer.
 */
function pluginSource(type: string): string {
  const own = ["component.tsx", "settings.ts", "transform.ts"]
    .map((f) => join(PLUGIN_DIR, type, f))
    .map(readIfPresent)
    .join("\n");

  const delegated = [...own.matchAll(/from\s+"@\/components\/([\w./-]+)"/g)]
    .flatMap((m) => [`${m[1]}.tsx`, `${m[1]}.ts`])
    .map((rel) => join(APP_SRC, "components", rel))
    .map(readIfPresent)
    .join("\n");

  return `${own}\n${delegated}`;
}

/**
 * Options that are still not forwarded. Every entry is a live instance of the
 * #1397 bug and is tracked in a follow-up issue. This list may only shrink —
 * adding to it means shipping another control that lies.
 *
 * `parameter-select` is a different case and is listed for a different reason:
 * its options are consumed by dashboard-level code (`lib/shared/url-params.ts`,
 * `lib/parameter/apply-param-defaults.ts`) rather than by the plugin's render
 * path, so this check cannot see them. `syncToUrl` genuinely works (#1388);
 * `defaultValue` genuinely does not, because `extractParamDefaults` has zero
 * callers — which is #1421, not this issue. Note the limit that exposes: a key
 * referenced only from dead code would satisfy a text search. This ratchet
 * catches "advertised but never wired", not "wired to nothing".
 */
const KNOWN_UNFORWARDED: Record<string, string[]> = {
  graph: ["nodeSize", "showRelationshipLabels", "physics"],
  json: ["fontSize", "showCopyButton", "theme"],
  line: ["samplingThreshold", "samplingMethod"],
  map: ["markerSize", "showPopup"],
  "parameter-select": ["defaultValue", "syncToUrl"],
};

describe("chart option forwarding ratchet (#1397)", () => {
  const types = chartTypesWithOptions();

  it("finds chart types to check", () => {
    expect(types.length).toBeGreaterThan(5);
  });

  it("finds option keys for every chart type", () => {
    // Guards the source-parsing above: if the option-definition shape ever
    // changes, every type would yield zero keys and the ratchet would pass
    // vacuously. Fail loudly instead.
    const empty = types.filter((t) => optionKeys(t).length === 0);
    expect(empty).toEqual([]);
  });

  it.each(types)("%s reads every option it advertises", (type) => {
    const src = pluginSource(type);
    const allowed = new Set(KNOWN_UNFORWARDED[type] ?? []);
    const unforwarded = optionKeys(type).filter(
      (k) => !allowed.has(k) && !new RegExp(`\\b${k}\\b`).test(src),
    );
    expect(unforwarded).toEqual([]);
  });

  it("the allowlist names only options that are genuinely unforwarded", () => {
    // Stops the list rotting: once an entry is fixed it must be removed, so the
    // ratchet keeps tightening instead of quietly permitting a working key.
    for (const [type, keys] of Object.entries(KNOWN_UNFORWARDED)) {
      const src = pluginSource(type);
      for (const key of keys) {
        expect(
          new RegExp(`\\b${key}\\b`).test(src),
          `${type}.${key} is allowlisted but is now read — remove it`,
        ).toBe(false);
      }
    }
  });
});
