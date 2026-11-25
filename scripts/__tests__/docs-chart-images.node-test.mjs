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
    it(`${page} embeds a light and a dark image that exist`, () => {
      const src = readFileSync(join(CHARTS, page), "utf8");
      const refs = [...src.matchAll(/!\[[^\]]*\]\((\/charts\/[^)\s]+)\)/g)].map(
        (m) => m[1],
      );
      assert.ok(refs.length > 0, `${page} embeds no /charts/ image`);
      for (const ref of refs) {
        assert.ok(existsSync(join(DOCS, "public", ref)), `${ref} is missing`);
      }
      for (const theme of ["light", "dark"]) {
        assert.ok(
          refs.some((r) => r.endsWith(`-${theme}.png`)),
          `${page} has no ${theme} image`,
        );
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

    for (const page of pages) {
      it(`${page} has an <img> under "${base}/"`, () => {
        const file = join(
          DIST,
          "charts",
          page.replace(/\.mdx$/, ""),
          "index.html",
        );
        assert.ok(existsSync(file), `${file} was not built`);
        const html = readFileSync(file, "utf8");
        const srcs = [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)]
          .map((m) => m[1])
          .filter((s) => s.includes("/charts/"));
        assert.ok(srcs.length > 0, `${page} built with no chart <img>`);
        for (const s of srcs) {
          assert.ok(
            s.startsWith(`${base}/charts/`),
            `${s} lacks the base "${base}"`,
          );
          assert.ok(
            existsSync(join(DIST, s.slice(base.length))),
            `${s} not in dist`,
          );
        }
      });
    }
  },
);
