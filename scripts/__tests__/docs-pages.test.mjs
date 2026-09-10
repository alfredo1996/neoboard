import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkDist } from "../check-docs-dist.mjs";
import rehypeBaseLinks from "../../docs/rehype-base-links.mjs";

// #1318 — the docs publish to a GitHub Pages project site, so every page lives
// under /<repo>/. The content links are root-absolute (/start-here/install/)
// and worked locally while every one of them would 404 on the deployed site.
// The source-level link checks in docs-accuracy.test.mjs check slugs, not
// deployed URLs, so they could not see it. These tests cover the three pieces
// that close that gap: the rehype step that prefixes the base, the checker that
// reads the built site the way Pages will serve it, and the workflows that run
// both.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

describe("rehype-base-links prefixes the base onto root-absolute links (#1318)", () => {
  const run = (tree, base = "/neoboard") => {
    rehypeBaseLinks({ base })(tree);
    return tree;
  };
  const a = (href) => ({
    type: "element",
    tagName: "a",
    properties: { href },
    children: [],
  });

  it("prefixes an anchor's href and an image's src", () => {
    const img = {
      type: "element",
      tagName: "img",
      properties: { src: "/screenshots/users.png" },
      children: [],
    };
    const tree = run({
      type: "root",
      children: [{ type: "element", tagName: "p", properties: {}, children: [a("/start-here/install/"), img] }],
    });
    expect(tree.children[0].children[0].properties.href).toBe(
      "/neoboard/start-here/install/",
    );
    expect(img.properties.src).toBe("/neoboard/screenshots/users.png");
  });

  it("prefixes an MDX component's href attribute (LinkCard)", () => {
    const card = {
      type: "mdxJsxFlowElement",
      name: "LinkCard",
      attributes: [
        { type: "mdxJsxAttribute", name: "title", value: "/not-a-link" },
        { type: "mdxJsxAttribute", name: "href", value: "/cli/commands/" },
      ],
      children: [],
    };
    run({ type: "root", children: [card] });
    expect(card.attributes[1].value).toBe("/neoboard/cli/commands/");
    expect(card.attributes[0].value).toBe("/not-a-link");
  });

  it.each([
    "https://github.com/alfredo1996/neoboard",
    "//cdn.example.com/x.js",
    "#top",
    "relative/page/",
    "mailto:someone@example.com",
  ])("leaves %s alone", (href) => {
    const link = a(href);
    run({ type: "root", children: [link] });
    expect(link.properties.href).toBe(href);
  });

  it.each([[{ base: "/" }], [{ base: "" }], [{}], [undefined]])(
    "is a no-op when called with %j",
    (options) => {
      const link = a("/start-here/install/");
      rehypeBaseLinks(options)({ type: "root", children: [link] });
      expect(link.properties.href).toBe("/start-here/install/");
    },
  );

  it("does not double the slash when the base ends with one", () => {
    const link = a("/start-here/install/");
    run({ type: "root", children: [link] }, "/neoboard/");
    expect(link.properties.href).toBe("/neoboard/start-here/install/");
  });
});

describe("check-docs-dist reads the built site the way Pages serves it (#1318)", () => {
  let dist;
  const write = (files) => {
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dist, path)), { recursive: true });
      writeFileSync(join(dist, path), body);
    }
  };
  const page = (...hrefs) =>
    `<html><body>${hrefs.map((h) => `<a href="${h}">x</a>`).join("")}</body></html>`;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), "1318-dist-"));
  });
  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  it("passes a site whose every internal link resolves under the base", () => {
    write({
      "index.html": page(
        "/neoboard/",
        "/neoboard",
        "/neoboard/a/",
        "/neoboard/a",
        "/neoboard/a/#heading",
        "/neoboard/b?q=1",
        "/neoboard/_astro/x.css",
        "https://github.com/alfredo1996/neoboard",
        "//cdn.example.com/x.js",
        "#top",
        "mailto:someone@example.com",
        "data:image/png;base64,AAAA",
      ),
      "a/index.html": page("/neoboard/"),
      "b.html": page(),
      "_astro/x.css": "",
    });
    expect(checkDist({ dist, base: "/neoboard" })).toEqual([]);
  });

  it("reports a link to a page the build did not emit", () => {
    write({ "index.html": page("/neoboard/missing/") });
    const problems = checkDist({ dist, base: "/neoboard" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("/neoboard/missing/");
    expect(problems[0]).toContain("index.html");
  });

  it("reports a root-absolute link that skips the base, even though the file exists", () => {
    // The exact #1318 failure: dist/start-here/install/index.html is there,
    // but Pages serves it at /neoboard/start-here/install/, so the link 404s.
    write({
      "index.html": page("/start-here/install/"),
      "start-here/install/index.html": page(),
    });
    const problems = checkDist({ dist, base: "/neoboard" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("/start-here/install/");
  });

  it("does not treat a sibling path that merely starts with the base as inside it", () => {
    write({ "index.html": page("/neoboard-other/"), "-other/index.html": page() });
    expect(checkDist({ dist, base: "/neoboard" })).toHaveLength(1);
  });

  it("resolves a relative link against the page it sits on", () => {
    // The splash hero's frontmatter link cannot take the base, so it is
    // written relative; the checker must still hold it to an emitted page.
    write({
      "index.html": page("start-here/install/", "gone/"),
      "start-here/install/index.html": page("../../", "../missing/"),
    });
    const problems = checkDist({ dist, base: "/neoboard" });
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("gone/");
    expect(problems.join("\n")).toContain("../missing/");
  });

  it("checks src attributes too", () => {
    write({ "index.html": '<img src="/neoboard/screenshots/gone.png">' });
    expect(checkDist({ dist, base: "/neoboard" })[0]).toContain(
      "/neoboard/screenshots/gone.png",
    );
  });

  it("checks every root-absolute link when the base is /", () => {
    write({ "index.html": page("/a/", "/missing/"), "a/index.html": page() });
    const problems = checkDist({ dist, base: "/" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("/missing/");
  });

  it("reports a build that emitted no HTML, instead of passing it vacuously", () => {
    expect(checkDist({ dist, base: "/" })).toEqual([
      expect.stringContaining("no HTML"),
    ]);
  });

  describe("with a site, the sitemap", () => {
    const site = "https://owner.github.io";
    const sitemap = (...locs) =>
      `<urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>`;

    it("must exist", () => {
      write({ "index.html": page() });
      expect(checkDist({ dist, base: "/neoboard", site })).toEqual([
        expect.stringContaining("sitemap-index.xml"),
      ]);
    });

    it("passes when every URL sits under the site and base", () => {
      write({
        "index.html": page(),
        "sitemap-index.xml": "<sitemapindex/>",
        "sitemap-0.xml": sitemap(`${site}/neoboard/`, `${site}/neoboard/a/`),
      });
      expect(checkDist({ dist, base: "/neoboard", site })).toEqual([]);
    });

    it("reports a URL outside the site and base", () => {
      write({
        "index.html": page(),
        "sitemap-index.xml": "<sitemapindex/>",
        "sitemap-0.xml": sitemap(`${site}/neoboard/`, `${site}/a/`),
      });
      const problems = checkDist({ dist, base: "/neoboard", site });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(`${site}/a/`);
    });

    it("compares the host case-insensitively, as @astrojs/sitemap lowercases it", () => {
      // new URL("/neoboard/", "https://Owner.github.io") is how the sitemap
      // builds its URLs, and a mixed-case org login is what github.repository_owner gives.
      write({
        "index.html": page(),
        "sitemap-index.xml": "<sitemapindex/>",
        "sitemap-0.xml": sitemap(`${site}/neoboard/`),
      });
      expect(
        checkDist({ dist, base: "/neoboard", site: "https://Owner.github.io" }),
      ).toEqual([]);
    });

    it("accepts a site written with a trailing slash", () => {
      write({
        "index.html": page(),
        "sitemap-index.xml": "<sitemapindex/>",
        "sitemap-0.xml": sitemap(`${site}/neoboard/`, `${site}//a/`),
      });
      const problems = checkDist({ dist, base: "/neoboard", site: `${site}/` });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(`${site}//a/`);
    });

    it("reports a sitemap index that lists no URLs", () => {
      write({ "index.html": page(), "sitemap-index.xml": "<sitemapindex/>" });
      expect(checkDist({ dist, base: "/neoboard", site })).toEqual([
        expect.stringContaining("no URLs"),
      ]);
    });
  });
});

describe("check-docs-dist on the command line, as the workflows run it (#1318)", () => {
  let dist;
  const cli = (env) =>
    spawnSync(process.execPath, [join(ROOT, "scripts/check-docs-dist.mjs"), dist], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, ...env },
    });

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), "1318-cli-"));
    mkdirSync(join(dist, "a"));
    writeFileSync(join(dist, "a/index.html"), "<p>a</p>");
  });
  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  it("exits non-zero with an ::error:: line when DOCS_BASE's links are broken", () => {
    writeFileSync(join(dist, "index.html"), '<a href="/a/">a</a>');
    const run = cli({ DOCS_BASE: "/neoboard" });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/^::error::index\.html: \/a\/ does not resolve under \/neoboard$/m);
  });

  it("exits zero on a clean build under DOCS_BASE", () => {
    // The same link would be broken under base "/", so this also proves the
    // CLI reads DOCS_BASE rather than defaulting.
    writeFileSync(join(dist, "index.html"), '<a href="/neoboard/a/">a</a>');
    const run = cli({ DOCS_BASE: "/neoboard" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  it("checks the sitemap only when DOCS_SITE is set", () => {
    writeFileSync(join(dist, "index.html"), '<a href="/neoboard/a/">a</a>');
    const run = cli({ DOCS_BASE: "/neoboard", DOCS_SITE: "https://owner.github.io" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("::error::sitemap-index.xml was not emitted");
  });
});

/** The text of one top-level job, from `  <name>:` up to the next job. */
function jobBlock(yaml, name) {
  const lines = yaml.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job "${name}" not found`).toBeGreaterThan(-1);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++)
    if (/^ {2}\S/.test(lines[i]) || /^\S/.test(lines[i])) {
      end = i;
      break;
    }
  return lines.slice(start, end).join("\n");
}

const code = (text) =>
  text
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/, ""))
    .join("\n");

describe("docs-pages.yml deploys the site to GitHub Pages (#1318)", () => {
  const yml = code(
    readFileSync(join(ROOT, ".github/workflows/docs-pages.yml"), "utf8"),
  );

  it("deploys on a push to dev and on demand, and on nothing else", () => {
    const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
    expect(on).toMatch(/^ {2}push:\n {4}branches: \[dev\]$/m);
    expect(on).toMatch(/^ {2}workflow_dispatch:/m);
    expect(on).not.toMatch(/pull_request|release\/|main/);
  });

  it("uses only GitHub's official actions", () => {
    const uses = [...yml.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThanOrEqual(5);
    expect(
      uses.filter(
        (u) =>
          !/^actions\/(checkout|setup-node|configure-pages|upload-pages-artifact|deploy-pages)@v\d+$/.test(
            u,
          ),
      ),
    ).toEqual([]);
  });

  it("skips every job unless the DOCS_DEPLOY repository variable is true", () => {
    // Pages is enabled after the org transfer. Until then configure-pages and
    // deploy-pages would fail every push to dev.
    const jobs = [
      ...yml.slice(yml.indexOf("\njobs:")).matchAll(/^ {2}([a-z-]+):$/gm),
    ].map((m) => m[1]);
    expect(jobs).toEqual(["build", "deploy"]);
    for (const job of jobs)
      expect(jobBlock(yml, job)).toMatch(
        /^ {4}if: vars\.DOCS_DEPLOY == 'true'$/m,
      );
  });

  it("builds with the project base, checks the result, then uploads it", () => {
    const build = jobBlock(yml, "build");
    // No DOCS_SITE yet: with a site set, the pinned @astrojs/sitemap 3.2.1
    // crashes Astro 7's build. DOCS_SITE comes back with the owner-approved
    // sitemap bump (#1318), and this assertion goes with it.
    expect(build).not.toContain("DOCS_SITE");
    expect(build).toContain("DOCS_BASE: /${{ github.event.repository.name }}");
    const order = [
      "npm ci --prefix docs",
      "npm run build --prefix docs",
      "node scripts/check-docs-dist.mjs docs/dist",
      "actions/upload-pages-artifact@",
    ].map((s) => build.indexOf(s));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(build).toMatch(/path: docs\/dist$/m);
  });

  it("grants Pages write only to the deploy job", () => {
    expect(yml).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(jobBlock(yml, "build")).not.toContain("pages: write");
    const deploy = jobBlock(yml, "deploy");
    expect(deploy).toMatch(/^ {6}pages: write$/m);
    expect(deploy).toMatch(/^ {6}id-token: write$/m);
    expect(deploy).toMatch(/^ {4}needs: build$/m);
  });
});

describe("docs-ci.yml checks the built site under the Pages base (#1318)", () => {
  const yml = code(
    readFileSync(join(ROOT, ".github/workflows/docs-ci.yml"), "utf8"),
  );
  const build = jobBlock(yml, "docs-build");

  it("builds once under the /neoboard base, without a site, and runs the checker on it", () => {
    // Without a site until the sitemap bump; see the docs-pages.yml test.
    expect(build).not.toContain("DOCS_SITE");
    expect(build.indexOf("DOCS_BASE: /neoboard")).toBeGreaterThan(-1);
    expect(
      build.lastIndexOf("node scripts/check-docs-dist.mjs docs/dist"),
    ).toBeGreaterThan(build.indexOf("DOCS_BASE: /neoboard"));
  });

  it("runs when the checker changes, not only when a page does", () => {
    const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("\nconcurrency:"));
    expect(on.match(/- 'scripts\/check-docs-dist\.mjs'/g)).toHaveLength(2);
  });
});
