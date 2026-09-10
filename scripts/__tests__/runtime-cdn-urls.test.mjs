import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Guards the list of things the app loads from the public internet at
// runtime (#1683).
//
// An air-gapped install works only if that list is known and short. Today it
// is four URLs: Swagger UI from unpkg on the API docs page, and the default
// OpenStreetMap tile template the map widget hands to Leaflet. Both are
// documented on /deploy/air-gapped. A fifth — a font from Google, a chart library from a
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
  // swagger-ui-dist is vendored — the open half of #1683 (a new dependency,
  // owner approval).
  "app/src/app/api/docs/route.ts: https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css",
  "app/src/app/api/docs/route.ts: https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js",
  "app/src/app/api/docs/route.ts: https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-standalone-preset.js",
  // The map's default basemap, fetched by each viewer's browser: the
  // renderer's OSM_TILE_URL and the Tile Layer option's default, the same
  // literal (#1705). An operator can point Tile Layer at their own tile
  // server or set it to `none`.
  "component/src/charts/map-chart.tsx: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "component/src/components/composed/chart-options/map.ts: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
];

// Scheme optional: `//host/x` is fetched over the page's own scheme.
const URL_CHARS = String.raw`(?:https?:)?\/\/[^"'\`\s>)]+`;
// `src=` as HTML (`src="…"`), JSX (`src={"…"}`) or a template (`src={\`…\`}`).
const ATTR = String.raw`=\{?["'\`]?`;
/** One pattern per way a URL becomes a network request. */
const LOADERS = [
  // `<Script>` is next/script — a real loader. `<Link>` is next/link — a
  // navigation, deliberately NOT matched, so no `i` flag here.
  new RegExp(
    String.raw`<(?:[sS]cript|img|iframe|video|audio)\b[^>]*\bsrc${ATTR}(${URL_CHARS})`,
    "g",
  ),
  new RegExp(String.raw`<link\b[^>]*\bhref${ATTR}(${URL_CHARS})`, "g"),
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

/** Every URL `text` would load at runtime, deduplicated, in loader order. */
export function runtimeUrls(text) {
  // Drop comment lines first, then match the whole text: Prettier wraps a
  // `<script>` tag or a `fetch(` call over several lines, and a per-line
  // scan never sees the URL on the line after the loader.
  const code = text
    .split("\n")
    .filter((line) => !COMMENT.test(line))
    .join("\n");
  const found = new Set();
  for (const re of LOADERS) for (const m of code.matchAll(re)) found.add(m[1]);
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
    // offline install has been broken by somewhere, so each gets a line —
    // including the multi-line shapes Prettier produces, which a per-line
    // scan cannot see, next/script's `<Script>`, JSX `src={...}` attributes
    // and protocol-relative `//host` URLs.
    expect(
      runtimeUrls(`
        <script src="https://cdn.example/lib.js"></script>
        <script
          src="https://cdn.example/wrapped.js"
          async
        ></script>
        <Script src="https://cdn.example/analytics.js" strategy="afterInteractive" />
        <script src={"https://cdn.example/jsx.js"} />
        <script src={\`https://unpkg.com/lib@\${v}/lib.js\`} />
        <script src="//cdn.example/protocol-relative.js"></script>
        <img src="https://cdn.example/logo.png" alt="" />
        <link rel="stylesheet" href="https://cdn.example/lib.css" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter&display=swap"
          crossOrigin="anonymous"
        />
        @import url("https://fonts.googleapis.com/css2?family=Inter");
        @import url("//fonts.googleapis.com/css2?family=Geist");
        src: url(https://cdn.example/font.woff2) format("woff2");
        const res = await fetch("https://api.example/latest");
        const json = await fetch(
          "https://updates.example.com/neoboard/latest-version.json",
          { cache: "no-store" },
        );
        const mod = await import("https://esm.example/mod.js");
        url: "https://{s}.tiles.example/{z}/{x}/{y}.png",
      `),
    ).toEqual([
      "https://cdn.example/lib.js",
      "https://cdn.example/wrapped.js",
      "https://cdn.example/analytics.js",
      "https://cdn.example/jsx.js",
      "https://unpkg.com/lib@${v}/lib.js",
      "//cdn.example/protocol-relative.js",
      "https://cdn.example/logo.png",
      "https://cdn.example/lib.css",
      "https://fonts.googleapis.com/css2?family=Inter&display=swap",
      "https://fonts.googleapis.com/css2?family=Inter",
      "//fonts.googleapis.com/css2?family=Geist",
      "https://cdn.example/font.woff2",
      "https://api.example/latest",
      "https://updates.example.com/neoboard/latest-version.json",
      "https://esm.example/mod.js",
      "https://{s}.tiles.example/{z}/{x}/{y}.png",
    ]);
  });

  it("ignores links, namespaces, comments and prose", () => {
    expect(
      runtimeUrls(`
        <a href="https://neoboard.app/docs">Docs</a>
        <Link href="https://neoboard.app/docs">Docs</Link>
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
