import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Guards the list of things the app loads from the public internet at
// runtime (#1683).
//
// An air-gapped install works only if that list is known and short. Today it
// is six URLs: Swagger UI from unpkg on the API docs page, and the basemap
// tile templates the map widget hands to Leaflet. Both are documented on
// /deploy/air-gapped. A seventh — a font from Google, a chart library from a
// CDN, a fetch to an update endpoint — would break offline installs while
// every test stayed green, because nothing here runs without a network. This
// test is the compiler for that: it enumerates every runtime script,
// stylesheet, tile template and outbound fetch in non-test source and
// compares the set, exactly, with the allow-list below. Add here when you add
// one on purpose; remove here when you remove one, so the list stays honest.
//
// Only URLs the browser or server would FETCH count. An `<a href>` to the
// docs site, an SVG `xmlns`, a URL quoted in a comment or an error message
// are navigation or prose, not network dependencies, and are not matched.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

/** Runtime source: the app, the component library and its global stylesheet. */
const SCAN = ["app/src", "component/src", "component/design-tokens.css"];
const SOURCE = /\.(ts|tsx|css)$/;
const SKIP = /(^|\/)(__tests__|e2e)\/|\.(test|stories)\.[jt]sx?$/;

/** Allowed as `<repo path>: <url as written in source>`. */
const ALLOWED = [
  // Swagger UI on the API docs page. Blank offline; stays until
  // swagger-ui-dist is vendored (#1683 — a new dependency, owner approval).
  "app/src/app/api/docs/route.ts: https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css",
  "app/src/app/api/docs/route.ts: https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js",
  "app/src/app/api/docs/route.ts: https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-standalone-preset.js",
  // Basemap tile presets. Fetched by each viewer's browser; the map chart
  // page documents self-hosted tiles and the no-basemap option.
  "component/src/charts/map-chart.tsx: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "component/src/charts/map-chart.tsx: https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  "component/src/charts/map-chart.tsx: https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
];

const URL_CHARS = String.raw`https?:\/\/[^"'\`\s>)]+`;
/** One pattern per way a URL becomes a network request. */
const LOADERS = [
  new RegExp(String.raw`<script\b[^>]*\bsrc=["']?(${URL_CHARS})`, "g"),
  new RegExp(String.raw`<link\b[^>]*\bhref=["']?(${URL_CHARS})`, "g"),
  new RegExp(String.raw`@import\s+(?:url\()?["']?(${URL_CHARS})`, "g"),
  new RegExp(String.raw`\burl\(\s*["']?(${URL_CHARS})`, "g"),
  new RegExp(String.raw`\b(?:fetch|import)\(\s*["'\`](${URL_CHARS})`, "g"),
  // A Leaflet tile template is fetched per tile by every viewer's browser.
  new RegExp(
    String.raw`["'\`](https?:\/\/[^"'\`\s]*\{z\}[^"'\`\s]*)["'\`]`,
    "g",
  ),
];
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

/** Every URL `text` would load at runtime, deduplicated, in source order. */
export function runtimeUrls(text) {
  const found = new Set();
  for (const line of text.split("\n")) {
    if (COMMENT.test(line)) continue;
    for (const re of LOADERS)
      for (const m of line.matchAll(re)) found.add(m[1]);
  }
  return [...found];
}

function sourceFiles(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const full = join(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return SOURCE.test(entry.name) ? [full] : [];
  });
}

function runtimeUrlsInRepo() {
  return SCAN.flatMap((root) => sourceFiles(join(ROOT, root)))
    .map((file) => relative(ROOT, file))
    .filter((file) => !SKIP.test(file))
    .flatMap((file) =>
      runtimeUrls(readFileSync(join(ROOT, file), "utf8")).map(
        (url) => `${file}: ${url}`,
      ),
    );
}

describe("runtime network dependencies (#1683)", () => {
  it("loads exactly the allow-listed URLs from the internet", () => {
    expect(runtimeUrlsInRepo().sort()).toEqual([...ALLOWED].sort());
  });

  it("recognises every way a URL becomes a request", () => {
    // The guard is only as good as its patterns. Each shape below is one an
    // offline install has been broken by somewhere, so each gets a line.
    expect(
      runtimeUrls(`
        <script src="https://cdn.example/lib.js"></script>
        <link rel="stylesheet" href="https://cdn.example/lib.css" />
        @import url("https://fonts.googleapis.com/css2?family=Inter");
        src: url(https://cdn.example/font.woff2) format("woff2");
        const res = await fetch("https://api.example/latest");
        const mod = await import("https://esm.example/mod.js");
        url: "https://{s}.tiles.example/{z}/{x}/{y}.png",
      `),
    ).toEqual([
      "https://cdn.example/lib.js",
      "https://cdn.example/lib.css",
      "https://fonts.googleapis.com/css2?family=Inter",
      "https://cdn.example/font.woff2",
      "https://api.example/latest",
      "https://esm.example/mod.js",
      "https://{s}.tiles.example/{z}/{x}/{y}.png",
    ]);
  });

  it("ignores links, namespaces, comments and prose", () => {
    expect(
      runtimeUrls(`
        <a href="https://neoboard.app/docs">Docs</a>
        <svg xmlns="http://www.w3.org/2000/svg" />
        // see https://react.dev/learn for why
        /* <script src="https://cdn.example/commented-out.js"> */
         * <link href="https://cdn.example/in-a-doc-comment.css">
        message: "Enter a valid URL (e.g. https://…).",
        upgradeUrl = "https://neoboard.app/enterprise",
      `),
    ).toEqual([]);
  });
});
