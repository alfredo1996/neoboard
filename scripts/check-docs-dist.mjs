#!/usr/bin/env node
// Checks a built docs site the way GitHub Pages will serve it (#1318).
//
//   DOCS_SITE=https://owner.github.io DOCS_BASE=/neoboard \
//     node scripts/check-docs-dist.mjs docs/dist
//
// Pages serves dist/ under DOCS_BASE, so a root-absolute link must start with
// the base AND land on an emitted file once the base is stripped. A link that
// skips the base still finds its file in dist/ and still 404s in production —
// which is why this reads the build, not the sources. With DOCS_SITE set, the
// sitemap must exist and list only URLs under site + base.
//
// Same env as the build, so the workflow passes it once. No dependencies.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const ORIGIN = "https://docs.invalid";
const isFile = (path) => existsSync(path) && statSync(path).isFile();

/** Problems found in `dist`, as printable strings; [] when the site is sound. */
export function checkDist({ dist, base = "/", site }) {
  // "/neoboard/" -> "/neoboard"; "/" or "" -> "".
  const prefix = (base ?? "").replace(/\/+$/, "");
  const files = walk(dist);
  const pages = files.filter((f) => f.endsWith(".html"));
  if (pages.length === 0) return [`${dist}: no HTML pages, nothing to check`];

  const problems = [];
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    // Resolve like a browser on the served page, so relative links count too;
    // anything that lands on another origin (https:, //cdn, mailto:) is external.
    const here = new URL(`${prefix}/${relative(dist, page)}`, ORIGIN);
    for (const [, url] of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const resolved = new URL(url, here);
      if (resolved.origin !== ORIGIN) continue;
      const path = resolved.pathname;
      const inside = path === prefix || path.startsWith(`${prefix}/`);
      const target = join(dist, path.slice(prefix.length));
      const resolves =
        isFile(target) ||
        isFile(join(target, "index.html")) ||
        isFile(`${target}.html`);
      if (!inside || !resolves)
        problems.push(`${relative(dist, page)}: ${url} does not resolve under ${prefix || "/"}`);
    }
  }

  if (site) {
    if (!isFile(join(dist, "sitemap-index.xml"))) {
      problems.push("sitemap-index.xml was not emitted");
    } else {
      const want = `${site.replace(/\/+$/, "")}${prefix}/`;
      const locs = files
        .filter((f) => /sitemap-\d+\.xml$/.test(f))
        .flatMap((f) =>
          [...readFileSync(f, "utf8").matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]),
        );
      if (locs.length === 0) problems.push("the sitemap lists no URLs");
      for (const loc of locs)
        if (!loc.startsWith(want)) problems.push(`sitemap: ${loc} is outside ${want}`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = process.argv[2] ?? "docs/dist";
  const problems = checkDist({
    dist,
    base: process.env.DOCS_BASE,
    site: process.env.DOCS_SITE,
  });
  for (const p of problems) console.error(`::error::${p}`);
  console.log(
    `${dist} (base ${process.env.DOCS_BASE || "/"}): ${problems.length} problem(s)`,
  );
  process.exitCode = problems.length ? 1 : 0;
}
