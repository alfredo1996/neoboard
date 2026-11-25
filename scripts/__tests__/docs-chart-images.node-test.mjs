import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// #1745 — every chart page shows the chart it documents.
//
// The pictures are committed PNGs under docs/public/charts/, written by
// `node scripts/shoot-stories.mjs --docs` from the real Storybook stories, one
// light and one dark per page. Source check: each page embeds an image and
// every embedded file exists. Built check (DOCS_BUILT=1, built with
// DOCS_BASE=/neoboard as Pages does): each page's HTML has an <img> that
// carries the base path and resolves to a file in docs/dist.
//
// node:test, not vitest, so the Docs workflow can run it with no install.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = join(ROOT, "docs");
const CHARTS = join(DOCS, "src/content/docs/charts");
// index.mdx is the overview table of every chart, not one chart's page.
const pages = readdirSync(CHARTS)
  .filter((f) => f.endsWith(".mdx") && f !== "index.mdx")
  .sort();

describe("chart pages embed their chart (#1745)", () => {
  it("finds the chart pages", () => {
    assert.ok(pages.length >= 17, `only ${pages.length} chart pages found`);
  });

  for (const page of pages) {
    it(`${page} puts its own light and dark image in the matching wrapper`, () => {
      const slug = page.replace(/\.mdx$/, "");
      const src = readFileSync(join(CHARTS, page), "utf8");
      for (const theme of ["light", "dark"]) {
        const ref = `/charts/${slug}-${theme}.png`;
        const block = src.match(
          new RegExp(
            `<div class="chart-shot chart-shot-${theme}">([\\s\\S]*?)</div>`,
          ),
        );
        assert.ok(block, `${page} has no chart-shot-${theme} wrapper`);
        assert.ok(
          block[1].includes(`](${ref})`),
          `${page}: chart-shot-${theme} does not embed ${ref}`,
        );
        assert.ok(existsSync(join(DOCS, "public", ref)), `${ref} is missing`);
      }
    });
  }
});

describe(
  "built chart pages carry their image under the base",
  { skip: process.env.DOCS_BUILT !== "1" },
  () => {
    const base = (process.env.DOCS_BASE ?? "").replace(/\/+$/, "");
    const DIST = join(DOCS, "dist");

    it("the built CSS carries the theme rules that pick the image", () => {
      const css = readdirSync(join(DIST, "_astro"))
        .filter((f) => f.endsWith(".css"))
        .map((f) => readFileSync(join(DIST, "_astro", f), "utf8"))
        .join("\n");
      for (const theme of ["light", "dark"]) {
        assert.ok(
          css.includes(`.chart-shot-${theme}`),
          `no .chart-shot-${theme} rule`,
        );
      }
    });

    for (const page of pages) {
      it(`${page} has both <img> under "${base}/"`, () => {
        const slug = page.replace(/\.mdx$/, "");
        const file = join(DIST, "charts", slug, "index.html");
        assert.ok(existsSync(file), `${file} was not built`);
        const html = readFileSync(file, "utf8");
        for (const theme of ["light", "dark"]) {
          const ref = `${base}/charts/${slug}-${theme}.png`;
          assert.ok(
            html.includes(`src="${ref}"`),
            `${page} built without <img src="${ref}">`,
          );
          assert.ok(
            existsSync(join(DIST, ref.slice(base.length))),
            `${ref} not in dist`,
          );
        }
      });
    }
  },
);
