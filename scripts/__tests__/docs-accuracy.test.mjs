import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

// Guards against documentation that describes software we did not write.
//
// The docs audit (#1316) found 7 environment variables, several CLI flags and
// a whole block of sample terminal output that exist nowhere in the source —
// invented, plausible, and impossible to distinguish from the real ones by
// reading. Prose has no compiler, so these three checks are the compiler.
//
// Each check is deliberately weak: it asks whether a documented token appears
// ANYWHERE in source, not whether the surrounding sentence is true. That is
// the part a machine can decide, and it is exactly the class of error that
// slipped through.
//
// Scope: the PUBLISHED site under docs/src. The repo's own docs (CLAUDE.md,
// ARCHITECTURE.md, .claude/skills) have their own guard —
// app/src/lib/__tests__/docs-accuracy.test.ts — same name, different target.
// Add site checks here, repo checks there.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const DOCS_ROOT = join(ROOT, "docs/src/content/docs");

/** Every .md/.mdx under the docs content root, as { path, text }. */
function docsFiles(dir = DOCS_ROOT) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...docsFiles(full));
    else if (/\.mdx?$/.test(entry.name))
      out.push({
        path: relative(ROOT, full),
        text: readFileSync(full, "utf8"),
      });
  }
  return out;
}

const DOCS = docsFiles();

/** Every `backticked` span in the docs, with the file it came from. */
function backtickedTokens() {
  const found = [];
  for (const { path, text } of DOCS) {
    for (const m of text.matchAll(/`([^`\n]+)`/g))
      found.push({ path, token: m[1] });
  }
  return found;
}

describe("docs accuracy guards (#1316)", () => {
  it("documents no environment variable that does not exist in source", () => {
    // SCREAMING_SNAKE with at least one underscore. Requiring the underscore
    // drops SQL keywords (`BEGIN`, `READ ONLY`) and HTTP verbs without needing
    // a keyword denylist that would drift.
    const ENV_SHAPE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;

    const inSource = new Set(
      execFileSync(
        "git",
        [
          "grep",
          "-hoE",
          "[A-Z][A-Z0-9]*(_[A-Z0-9]+)+",
          "--",
          "app/src",
          "cli/src",
          "connection/src",
          "connector-sdk/src",
          "component/src",
          "scripts",
          "docker",
          ".env.example",
        ],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      ).split("\n"),
    );

    const phantom = backtickedTokens()
      .filter(({ token }) => ENV_SHAPE.test(token) && !inSource.has(token))
      .map(({ path, token }) => `${token} (${path})`);

    expect(phantom).toEqual([]);
  });

  it("documents every environment variable the app requires", () => {
    // The inverse of the check above, and the one that was missing: docs can
    // be wrong by omitting as well as by inventing. Both production setup
    // snippets left out API_KEY_HMAC_SECRET, which env-config marks required,
    // so a deployment that followed the page failed startup validation.
    const registry = readFileSync(
      join(ROOT, "app/src/lib/env-config.ts"),
      "utf8",
    );
    const required = [
      ...registry.matchAll(/key:\s*"([A-Z0-9_]+)"[^}]*?required:\s*true/gs),
    ].map((m) => m[1]);
    expect(required.length).toBeGreaterThan(0); // the regex still matches

    const documented = new Set(
      backtickedTokens()
        .map(({ token }) => token)
        .concat(
          DOCS.flatMap(({ text }) =>
            [...text.matchAll(/[A-Z][A-Z0-9_]{3,}/g)].map((m) => m[0]),
          ),
        ),
    );

    expect(required.filter((k) => !documented.has(k))).toEqual([]);
  });

  it("references no CLI command the CLI does not register", () => {
    // Validates the FULL invocation, not just the first verb. `neoboard env
    // init` shipped on three docs pages and errored on every run (#1311) —
    // `env` is registered, so a first-verb-only check waves it through. That
    // check was this test's first version, and it did exactly that.
    //
    // The signal for "may a word follow this command?" is commander's own
    // registration string: `.command("logs [service]")` declares an argument,
    // `.command("env")` declares none, and a variable-assigned command is a
    // sub-command group whose children are the only words allowed after it.
    const cliSrc = readFileSync(join(ROOT, "cli/src/index.ts"), "utf8");

    const takesArg = {}; // name -> declares <arg> or [arg]
    const children = {}; // name -> Set of registered sub-commands
    const known = new Set();

    const declare = (sig) => {
      const name = sig.split(/[\s<[]/)[0];
      known.add(name);
      takesArg[name] = /[<[]/.test(sig);
      return name;
    };
    for (const m of cliSrc.matchAll(/program\s*\n?\s*\.command\(\s*"([^"]+)"/g))
      declare(m[1]);
    for (const m of cliSrc.matchAll(
      /(?:const|let)\s+(\w+)\s*=\s*program\s*\n?\s*\.command\(\s*"([^"]+)"/g,
    )) {
      const group = declare(m[2]);
      children[group] = new Set(
        [
          ...cliSrc.matchAll(
            new RegExp(`\\b${m[1]}\\s*\\n?\\s*\\.command\\(\\s*"([^"]+)"`, "g"),
          ),
        ].map((c) => {
          const child = declare(c[1]);
          return child;
        }),
      );
    }
    expect(known.size).toBeGreaterThan(5); // the regexes still match

    // "neoboard" is also the Postgres user and database name, so it appears
    // mid-line in pg_dump invocations. Only count it at a command position:
    // start of line (optionally after a `$` prompt) or opening a code span.
    const unknown = new Set();
    for (const { path, text } of DOCS)
      for (const m of text.matchAll(
        /(?:^[ \t]*\$?[ \t]*|`)neoboard[ \t]+([a-z][a-z-]{2,})(?:[ \t]+([a-z][a-z-]{2,}))?/gm,
      )) {
        const [, verb, next] = m;
        if (!known.has(verb)) {
          unknown.add(`neoboard ${verb} (${path})`);
        } else if (next && !takesArg[verb]) {
          // No declared argument, so the only legal next word is a registered
          // sub-command of this group.
          if (!children[verb]?.has(next))
            unknown.add(`neoboard ${verb} ${next} (${path})`);
        }
      }

    expect([...unknown]).toEqual([]);
  });

  it("documents no Bearer token the app would reject", () => {
    // `resolveApiKeyAuth` resolves `Authorization: Bearer` ONLY for the `nb_`
    // API-key prefix; anything else falls through to cookie auth and 401s. The
    // key-rotation runbook told operators to send a session cookie as a Bearer
    // token (#1277) — during a suspected key compromise, mid-procedure, with
    // the next step being "delete the old key". A wrong auth scheme in a curl
    // is prose to every other check here, so it gets its own.
    const bad = [];
    for (const { path, text } of DOCS)
      for (const m of text.matchAll(/Authorization:\s*Bearer\s+(\S+)/g))
        if (!m[1].startsWith("nb_") && !m[1].startsWith("`nb_"))
          bad.push(`${m[1]} (${path})`);

    expect(bad).toEqual([]);
  });

  it("has no broken internal links", () => {
    // Starlight slug: path under the content root, minus extension, with
    // index collapsing to its directory. Trailing slash is optional in links.
    const slugs = new Set(
      DOCS.map(({ path }) =>
        relative(join(ROOT, "docs/src/content/docs"), join(ROOT, path))
          .replace(/\.mdx?$/, "")
          .replace(/(^|\/)index$/, ""),
      ).map((s) => `/${s}`.replace(/\/$/, "") || "/"),
    );

    const broken = [];
    for (const { path, text } of DOCS)
      for (const m of text.matchAll(/\]\((\/[^)#?\s]*)/g)) {
        const target = m[1].replace(/\/$/, "") || "/";
        // Assets (/favicon.svg, /og.png) resolve against docs/public, not a
        // page slug — checked there instead.
        if (/\.[a-z0-9]{2,4}$/i.test(target)) {
          if (!existsSync(join(ROOT, "docs/public", target)))
            broken.push(`${target} (${path})`);
          continue;
        }
        if (!slugs.has(target)) broken.push(`${target} (${path})`);
      }

    expect(broken).toEqual([]);
  });
});

// Not docs, but the same class of silent-wrong: a hint that names a hostname
// which does not resolve is worse than no hint. The connection-failure hint
// tells users to reach a host database via host.docker.internal, which Docker
// Desktop provides automatically and Linux does NOT — it needs an explicit
// host-gateway mapping. The CLI supplies that via an opt-in overlay, so the
// overlay is the thing that has to keep existing and keep saying it (#1346).
describe("the --expose-host overlay backs the hint that names it", () => {
  it("maps host.docker.internal on the APP service", () => {
    // Resolved by compose, not substring-matched: the raw string would also
    // pass from a comment, an unrelated service, or malformed YAML — and a
    // mapping on the wrong service is exactly the failure this guards.
    const resolved = JSON.parse(
      execFileSync(
        "docker",
        [
          "compose",
          "-f",
          join(ROOT, "docker/docker-compose.full.yml"),
          "-f",
          join(ROOT, "docker/docker-compose.expose-host.yml"),
          "config",
          "--format",
          "json",
        ],
        {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
          // Placeholders for the compose file's `:?` required vars, rather
          // than --env-file docker/.env: that file is gitignored and
          // CLI-generated, so it exists on a developer machine and NOT in CI.
          // Depending on it is how this check passed locally and failed there
          // — the same trap as #1221, in the test written to avoid traps.
          env: {
            ...process.env,
            ENCRYPTION_KEY: "0".repeat(64),
            NEXTAUTH_SECRET: "test-secret",
            API_KEY_HMAC_SECRET: "0".repeat(64),
          },
        },
      ),
    );
    // Compose normalises extra_hosts differently across versions and shapes:
    // an array with `:`, an array with `=`, or a host->target map. CI emits
    // `host.docker.internal=host-gateway` where this machine emits `:`, which
    // failed a literal comparison. Compare the MAPPING, not the spelling.
    const raw = resolved.services.neoboard.extra_hosts ?? [];
    const mappings = (
      Array.isArray(raw) ? raw : Object.entries(raw).map((e) => e.join("="))
    ).map((entry) => entry.replace(/[:=]/, "="));

    expect(mappings).toContain("host.docker.internal=host-gateway");
  }, 60_000);

  it("is the ONLY place that maps it — otherwise the flag is a no-op", () => {
    // If a base compose file also carried the mapping, --expose-host would
    // appear to work while actually doing nothing, and removing the overlay
    // would break nothing visible until a Linux user hit it.
    const carriers = readdirSync(join(ROOT, "docker"))
      .filter((f) => f.endsWith(".yml"))
      .filter((f) =>
        readFileSync(join(ROOT, "docker", f), "utf8").includes("host-gateway"),
      );
    expect(carriers).toEqual(["docker-compose.expose-host.yml"]);
  });
});

describe("the site's own navigation and links resolve (#1574)", () => {
  /** Slugs Starlight will serve, derived from the content collection. */
  const pageSlugs = () =>
    new Set([
      "/",
      ...DOCS.map(({ path }) =>
        `/${relative(DOCS_ROOT, path)}`
          .replace(/\.mdx?$/, "")
          .replace(/\/index$/, ""),
      ),
    ]);

  it("puts every content directory in the sidebar", () => {
    // authentication/ held four pages including the 1,584-word SSO setup
    // guide, and no sidebar group pointed at it — so the enterprise auth
    // documentation existed on the site and in no navigation.
    const config = readFileSync(join(ROOT, "docs/astro.config.mjs"), "utf8");
    const generated = new Set(
      [...config.matchAll(/autogenerate:\s*\{\s*directory:\s*"([^"]+)"/g)].map(
        (m) => m[1],
      ),
    );
    const dirs = readdirSync(DOCS_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    expect(dirs.filter((d) => !generated.has(d))).toEqual([]);
  });

  it("links only to pages and assets that exist", () => {
    // Nine LinkCards pointed at an information architecture that was never
    // built (/connections/*, /dashboards/*), while the real pages sat under
    // /guides and /concepts. Every one rendered as a 404.
    const slugs = pageSlugs();
    const broken = [];

    for (const { path, text } of DOCS) {
      const targets = [
        ...text.matchAll(/href="(\/[^"#?]*)"|\]\((\/[^)#?\s]*)\)/g),
      ]
        .map((m) => (m[1] ?? m[2]).replace(/\/$/, ""))
        .filter(Boolean);

      for (const target of targets) {
        // A leading-slash target is either a page slug or a file served from
        // docs/public (screenshots, downloads).
        const isAsset = existsSync(join(ROOT, "docs/public", target));
        if (!slugs.has(target) && !isAsset) {
          broken.push(`${relative(DOCS_ROOT, path)} -> ${target}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });

  it("does not forbid the render tests the app is full of", () => {
    // testing.mdx told contributors "Do NOT add @testing-library/react render
    // tests in app/. Vitest in app/ is for pure logic only" while app/src held
    // 65 .test.tsx files and app/vitest.config.ts defined a jsdom project for
    // exactly them (#1574). A rule the repo breaks 65 times is not a rule.
    const page = readFileSync(
      join(ROOT, "docs/src/content/docs/extend/testing.mdx"),
      "utf8",
    );
    const config = readFileSync(join(ROOT, "app/vitest.config.ts"), "utf8");

    expect(config).toContain("jsdom");
    expect(page).not.toMatch(
      /Do NOT add `?@testing-library\/react`? render tests/i,
    );
    expect(page).not.toMatch(/Vitest in `?app\/`? is for pure logic only/i);
  });
});

describe("the site's chart counts match the registry (#1687)", () => {
  it("states the registered count wherever it states one", () => {
    // Unregistering two charts left community.mdx and cli/commands.mdx saying
    // 20 because nothing pinned the number. Every "N chart types",
    // "N built-in chart types" or "Charts (N built-in" must equal the
    // CHART_TYPES array the app registers from.
    const registered = [
      ...readFileSync(
        join(ROOT, "app/src/plugins/chart-types.ts"),
        "utf8",
      ).matchAll(/^\s+"([\w-]+)",$/gm),
    ].length;
    expect(registered).toBeGreaterThan(0); // the regex still matches

    const CLAIM =
      /\b(\d+) (?:built-in )?chart types\b|Charts \((\d+) built-in/g;
    const claims = DOCS.flatMap(({ path, text }) =>
      [...text.matchAll(CLAIM)].map((m) => ({ path, n: Number(m[1] ?? m[2]) })),
    );
    expect(claims.length).toBeGreaterThan(0);
    expect(
      claims.filter((c) => c.n !== registered).map((c) => `${c.path}: ${c.n}`),
    ).toEqual([]);
  });
});

describe("the seven-group information architecture (#1681)", () => {
  // Eight autogenerated groups with no page ordered meant every group was
  // alphabetical by filename: Getting Started opened with Configuration, CLI
  // put the 463-line reference above its tutorials, and the Developer Guide
  // showed raw directory names as labels. Six index pages were card grids
  // duplicating the sidebar, and two tutorials described the same walkthrough
  // with different Cypher. These guards keep the replacement honest.
  const config = readFileSync(join(ROOT, "docs/astro.config.mjs"), "utf8");
  const frontmatter = (text) => text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const pageSlug = (path) =>
    `/${relative(DOCS_ROOT, path)}`
      .replace(/\.mdx?$/, "")
      .replace(/\/index$/, "");
  const SPLASH = "docs/src/content/docs/index.mdx";
  const CONTENT = DOCS.filter(({ path }) => path !== SPLASH);
  const slugs = new Set(DOCS.map(({ path }) => pageSlug(path)));
  const redirects = [...config.matchAll(/"(\/[^"]+)":\s*"(\/[^"]+)"/g)].map(
    (m) => [m[1], m[2].replace(/\/$/, "")],
  );
  // Every slug the base branch served that no longer exists (`comm -23` of
  // the two content trees). A hand-picked dozen guarded a 46-entry map, so
  // the other 34 could lose their redirect without a test noticing.
  const RETIRED = [
    "/getting-started",
    "/getting-started/installation",
    "/getting-started/quick-start",
    "/getting-started/configuration",
    "/getting-started/migration-from-neodash",
    "/getting-started/troubleshooting",
    "/guides",
    "/guides/first-dashboard",
    "/guides/connecting-databases",
    "/guides/keyboard-shortcuts",
    "/guides/query-history",
    "/guides/managing-users",
    "/guides/api-keys",
    "/concepts",
    "/concepts/dashboards",
    "/concepts/widgets",
    "/concepts/parameters",
    "/concepts/connectors",
    "/concepts/architecture",
    "/concepts/multi-tenancy",
    "/concepts/query-safety",
    "/administration",
    "/administration/reverse-proxy",
    "/administration/backup-restore",
    "/administration/monitoring",
    "/administration/deployment-checklist",
    "/authentication",
    "/authentication/password-login",
    "/authentication/sso",
    "/authentication/roles",
    "/cli/docker-setup",
    "/cli/local-setup",
    "/developer",
    "/developer/extending/new-chart-plugin",
    "/developer/extending/new-chart-type",
    "/developer/extending/new-connector-plugin",
    "/developer/extending/new-connector",
    "/developer/extending/new-parameter-type",
    "/developer/extending/new-widget-type",
    "/developer/plugins",
    "/developer/plugins/mongodb-connector",
    "/developer/plugins/community",
    "/developer/contributing/setup",
    "/developer/contributing/code-style",
    "/developer/contributing/testing",
    "/developer/contributing/pr-workflow",
  ];
  /** `git grep -noE` over tracked files as { path, line, match }; [] when nothing matches. */
  const gitGrep = (pattern, pathspecs) => {
    let out = "";
    try {
      out = execFileSync("git", ["grep", "-noE", pattern, "--", ...pathspecs], {
        cwd: ROOT,
        encoding: "utf8",
      });
    } catch (e) {
      if (e.status !== 1) throw e; // 1 = no matches, anything else is real
    }
    return out
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [path, line, ...rest] = l.split(":");
        return { path, line, match: rest.join(":") };
      });
  };

  it("has exactly the seven groups, in reading order, one directory each", () => {
    const sidebar = config.slice(config.indexOf("sidebar:"));
    const labels = [...sidebar.matchAll(/label:\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(labels).toEqual([
      "Start here",
      "Using NeoBoard",
      "Chart types",
      "Deploy and operate",
      "Security and access",
      "CLI",
      "Extend and contribute",
    ]);
    const dirs = readdirSync(DOCS_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(dirs).toEqual(
      [
        "start-here",
        "using",
        "charts",
        "deploy",
        "security",
        "cli",
        "extend",
      ].sort(),
    );
  });

  it("gives every content page an explicit sidebar order", () => {
    const missing = CONTENT.filter(
      ({ text }) =>
        !/^sidebar:\n(?:[ \t]+.*\n)*?[ \t]+order:\s*\d+/m.test(
          frontmatter(text),
        ),
    ).map(({ path }) => path);
    expect(missing).toEqual([]);
  });

  it("reaches every page from at least one other page", () => {
    // reverse-proxy, keyboard-shortcuts, query-history and migration-from-
    // neodash existed only in the sidebar; nothing on the site pointed at them.
    const inbound = new Map(CONTENT.map(({ path }) => [pageSlug(path), 0]));
    for (const { path, text } of DOCS) {
      const from = pageSlug(path);
      for (const m of text.matchAll(
        /href="(\/[^"#?]*)|\]\((\/[^)#?\s]*)|^\s+link:\s*(\/[^\s#?]*)/gm,
      )) {
        const target = (m[1] ?? m[2] ?? m[3]).replace(/\/$/, "");
        if (target !== from && inbound.has(target))
          inbound.set(target, inbound.get(target) + 1);
      }
    }
    const orphans = [...inbound].filter(([, n]) => n === 0).map(([s]) => s);
    expect(orphans).toEqual([]);
  });

  it("no longer serves the merged tutorials, folded guides and index pages", () => {
    expect(RETIRED.filter((s) => slugs.has(s))).toEqual([]);
  });

  it("redirects every retired slug, and only to pages that exist", () => {
    // A redirect whose source is still a page never fires; one whose target
    // is not a page is a 404 with extra steps.
    expect(redirects.length).toBeGreaterThan(0);
    const bad = redirects
      .filter(([from, to]) => slugs.has(from) || !slugs.has(to))
      .map(([from, to]) => `${from} -> ${to}`);
    expect(bad).toEqual([]);
    const covered = new Set(redirects.map(([from]) => from));
    expect(RETIRED.filter((s) => !covered.has(s))).toEqual([]);
  });

  it("references docs source files from the rest of the repo by paths that exist", () => {
    // Astro redirects cover the site's old slugs, not the repository's file
    // paths. cli/README.md (in the npm tarball), the CLI's plugin-validator
    // hint, docs/NEODASH_MIGRATION_GUIDE.md and the deploy skill all named
    // docs/src/content/docs/<old path>.mdx by file, and every one 404'd after
    // the move. A `content/docs/...` string anywhere outside the site must be
    // a file or directory that is still there.
    const stale = gitGrep("content/docs/[A-Za-z0-9_./-]*[A-Za-z0-9_]", [
      ".",
      ":!docs/src",
      ":!docs/.astro",
    ])
      .filter(({ match }) => !existsSync(join(ROOT, "docs/src", match)))
      .map(({ path, line, match }) => `${match} (${path}:${line})`);
    expect(stale).toEqual([]);
  });

  it("lands every docs-site link from the app, the CLI and the READMEs on a page or a redirect", () => {
    // The dashboard page's "Widget guide" pointed at /guides/widgets/ — a slug
    // that never existed (the page was /concepts/widgets) and one the redirect
    // map did not know either — so the app shipped a 404 in its own help link.
    const covered = new Set([...slugs, ...redirects.map(([from]) => from)]);
    const dead = gitGrep(
      "(neoboard\\.app/docs|alfredo1996\\.github\\.io/neoboard)/[A-Za-z0-9_./-]*",
      ["app/src", "cli", "README.md", "PLUGINS.md"],
    )
      .map(({ path, line, match }) => ({
        path,
        line,
        slug:
          match
            .replace(
              /^(neoboard\.app\/docs|alfredo1996\.github\.io\/neoboard)/,
              "",
            )
            .replace(/\/+$/, "") || "/",
      }))
      .filter(({ slug }) => !covered.has(slug))
      .map(({ path, line, slug }) => `${slug} (${path}:${line})`);
    expect(dead).toEqual([]);
  });

  it("anchors every #fragment link to a heading on the target page", () => {
    // backup-restore's "Key rotation" link resolved to Configuration after the
    // rotation procedure was carved out of it — a live page with no rotation
    // on it, which the slug check waves through. An anchor pins the section,
    // and this keeps the anchor honest. Ids follow Starlight's slugger:
    // lowercase, punctuation dropped, whitespace to hyphens.
    const idsOf = new Map(
      DOCS.map(({ path, text }) => [
        pageSlug(path),
        new Set(
          [...text.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm)].map((m) =>
            m[1]
              .toLowerCase()
              .replace(/[^\w\s-]/g, "")
              .replace(/\s/g, "-"),
          ),
        ),
      ]),
    );
    const dangling = [];
    for (const { path, text } of DOCS)
      for (const m of text.matchAll(
        /(?:href="|\]\()(\/[^"#?)\s]*)#([^"#?)\s]+)/g,
      )) {
        const [, target, anchor] = m;
        // A target that is not a page is the slug check's finding, not this one's.
        const ids = idsOf.get(target.replace(/\/$/, ""));
        if (ids && !ids.has(anchor))
          dangling.push(`${target}#${anchor} (${relative(DOCS_ROOT, path)})`);
      }
    expect(dangling).toEqual([]);
  });

  it("links to GitHub on a branch that still moves", () => {
    // developer/index.mdx pointed ARCHITECTURE.md at release/1.1, a branch
    // that stopped receiving commits three releases ago.
    const stale = [];
    for (const { path, text } of DOCS)
      for (const m of text.matchAll(
        /github\.com\/alfredo1996\/neoboard\/(?:blob|tree)\/(release\/[^/\s)]+)/g,
      ))
        stale.push(`${m[1]} (${path})`);
    expect(stale).toEqual([]);
  });
});

describe("production options: Run from a build (#1679)", () => {
  // Every production page presented Docker Compose as the only way to run
  // NeoBoard, while the Dockerfile shows nothing is Docker-specific except
  // the file assembly: `node app/server.js` on the standalone build, config
  // entirely via env. These keep the non-Docker page real and un-drifted.
  const PAGE = "docs/src/content/docs/deploy/run-from-a-build.mdx";
  const page = () => DOCS.find(({ path }) => path === PAGE)?.text ?? "";
  const text = (p) => DOCS.find(({ path }) => path === p)?.text ?? "";

  it("exists under Deploy and operate, ordered, and is offered from Install", () => {
    expect(page()).not.toBe("");
    expect(page().match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "").toMatch(
      /^sidebar:\n[ \t]+order:\s*\d+/m,
    );
    expect(text("docs/src/content/docs/start-here/install.mdx")).toContain(
      "/deploy/run-from-a-build",
    );
  });

  it("lists exactly the variables app/.env.example marks required", () => {
    // The Dockerfile names app/.env.example as the single documented list
    // (#931). The page's Required table is a copy, and copies drift — this
    // fails when either side gains or loses a variable.
    const example = readFileSync(join(ROOT, "app/.env.example"), "utf8");
    const requiredBlock = example
      .split(/^# ── /m)
      .find((s) => s.startsWith("Required"));
    const fromExample = [...requiredBlock.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)]
      .map((m) => m[1])
      .sort();
    expect(fromExample.length).toBeGreaterThan(0); // the parse still works

    const body = page();
    const section = body.slice(
      body.indexOf("### Required"),
      body.indexOf("\n##", body.indexOf("### Required") + 1),
    );
    const fromPage = [...section.matchAll(/^\|\s*`([A-Z][A-Z0-9_]+)`/gm)]
      .map((m) => m[1])
      .sort();

    expect(fromPage).toEqual(fromExample);
  });

  it("names only the image that is published", () => {
    // reverse-proxy's Traefik example pulled neoboard/community:latest —
    // an image that does not exist; everything else says ghcr.io/....
    const offenders = DOCS.filter(({ text }) =>
      text.includes("neoboard/community"),
    ).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("keeps the deployment checklist option-neutral", () => {
    const checklist = text(
      "docs/src/content/docs/deploy/deployment-checklist.mdx",
    );
    expect(checklist).not.toMatch(/NeoBoard container/);
    expect(checklist).not.toMatch(/Docker resource limits/);
  });
});
