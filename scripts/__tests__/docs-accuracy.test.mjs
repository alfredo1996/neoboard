import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { SHOWCASES } from "../demo/showcases.mjs";

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

/**
 * owner/repo, from the image the prod compose pulls — the source
 * app/src/lib/__tests__/docs-accuracy.test.ts reads too. release.yml publishes
 * ghcr.io/${{ github.repository }}, so it is the GitHub repo. A literal owner
 * in a link pattern matches nothing after the org transfer (#1213), and a
 * check over no links passes (#1781).
 */
function ownerRepo(root = ROOT) {
  const compose = "docker/docker-compose.prod-full.yml";
  const m = /ghcr\.io\/([\w-]+)\/([\w-]+):latest/.exec(
    readFileSync(join(root, compose), "utf8"),
  );
  if (!m) throw new Error(`${compose} no longer names a ghcr image`);
  return { owner: m[1], repo: m[2] };
}

/** `git grep -noE` over tracked files as { path, line, match }; [] when nothing matches. */
function gitGrep(pattern, pathspecs, { root = ROOT, ignoreCase = false } = {}) {
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["grep", ignoreCase ? "-noiE" : "-noE", pattern, "--", ...pathspecs],
      { cwd: root, encoding: "utf8" },
    );
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
}

const SITE_LINK_PATHS = ["app/src", "cli", "README.md", "PLUGINS.md"];

/**
 * The links under root that name this repo: its Pages site (from the app, the
 * CLI and the READMEs) and files on a GitHub ref (from the docs), with what is
 * wrong with them. Takes a root so the owner rename can be rehearsed in a copy.
 *
 * Any owner matches, in any case (GitHub and Pages hosts ignore it): a link a
 * partial rename left on the old owner is dead once Pages moves, and a pattern
 * spelled with the new owner would never see it (#1781).
 */
function repoLinks(root = ROOT) {
  const { owner, repo } = ownerRepo(root);
  const opts = { root, ignoreCase: true };
  const pages = gitGrep(
    `[A-Za-z0-9-]+\\.github\\.io/${repo}/[A-Za-z0-9_./-]*`,
    SITE_LINK_PATHS,
    opts,
  );
  const blobs = gitGrep(
    `github\\.com/[A-Za-z0-9-]+/${repo}/(blob|tree)/(release/)?[^/[:space:])]+`,
    ["docs/src/content/docs"],
    opts,
  );
  const ownerOf = ({ match }) =>
    /^(?:github\.com\/)?([\w-]+)/i.exec(match)[1].toLowerCase();
  const foreign = (links) =>
    links
      .filter((l) => ownerOf(l) !== owner.toLowerCase())
      .map(
        ({ path, line, match }) => `${match} (${path}:${line}) is not ${owner}`,
      );
  const mine = (links) =>
    links.filter((l) => ownerOf(l) === owner.toLowerCase());
  return {
    pages: mine(pages).map(({ path, line, match }) => ({
      path,
      line,
      slug: match.slice(match.indexOf("/") + 1 + repo.length),
    })),
    // A pattern that matches nothing is stale, not a clean tree (#1781).
    siteProblems: [
      ...(pages.length ? [] : [`no link to *.github.io/${repo}`]),
      ...foreign(pages),
    ],
    branchProblems: [
      ...(blobs.length ? [] : [`no github.com/*/${repo} blob/tree link`]),
      ...foreign(blobs),
      ...mine(blobs)
        .filter(({ match }) => /\/(blob|tree)\/release\//i.test(match))
        .map(({ path, line, match }) => `${match} (${path}:${line})`),
    ],
  };
}

/** Every `backticked` span in the docs, with the file it came from. */
function backtickedTokens() {
  const found = [];
  for (const { path, text } of DOCS) {
    for (const m of text.matchAll(/`([^`\n]+)`/g))
      found.push({ path, token: m[1] });
  }
  return found;
}

/** Keys env-config.ts marks `required: true` — the app exits at boot without them. */
function requiredFromRegistry() {
  const registry = readFileSync(
    join(ROOT, "app/src/lib/env-config.ts"),
    "utf8",
  );
  const keys = [
    ...registry.matchAll(/key:\s*"([A-Z0-9_]+)"[^}]*?required:\s*true/gs),
  ].map((m) => m[1]);
  if (keys.length === 0)
    throw new Error("env-config.ts parse found no required keys");
  return keys;
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
    const required = requiredFromRegistry();

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

describe("the site's chart counts match the registry (#1687, #1782)", () => {
  // Unregistering two charts left community.mdx and cli/commands.mdx saying
  // 20 because nothing pinned the number. Then the pin itself was wrong: it
  // held every claim to the REGISTERED count, but radar and choropleth stay
  // registered only so old dashboards render; the picker hides them (#1158).
  // A reader's "N chart types" is what the picker offers. Only the CLI's
  // `plugin list` output ("Charts (N built-in") counts registrations.
  const quoted = (file) =>
    [
      ...readFileSync(join(ROOT, file), "utf8").matchAll(/^\s+"([\w-]+)",?$/gm),
    ].map((m) => m[1]);
  const registered = quoted("app/src/plugins/chart-types.ts");
  const disabled = quoted("app/src/plugins/disabled-chart-types.ts");
  const selectable = registered.filter((t) => !disabled.includes(t));
  const COUNT = /\b(\d+) (?:built-in )?chart types\b/g;
  const claims = (re) =>
    DOCS.flatMap(({ path, text }) =>
      [...text.matchAll(re)].map((m) => ({ path, n: Number(m[1]) })),
    );
  const page = (p) =>
    DOCS.find(({ path }) => path === `docs/src/content/docs/${p}`)?.text ?? "";
  const section = (text, heading) =>
    text.split(`\n## ${heading}\n`)[1]?.split("\n## ")[0] ?? "";

  it("reads the registry", () => {
    expect(registered.length).toBeGreaterThan(0); // the regex still matches
    expect(disabled.filter((t) => !registered.includes(t))).toEqual([]);
  });

  it("states the count the widget picker offers wherever it states one", () => {
    const found = claims(COUNT);
    expect(found.length).toBeGreaterThan(0);
    expect(
      found
        .filter((c) => c.n !== selectable.length)
        .map((c) => `${c.path}: ${c.n}`),
    ).toEqual([]);
  });

  it("shows the registered count in the CLI's plugin list output", () => {
    const found = claims(/Charts \((\d+) built-in/g);
    expect(found.length).toBeGreaterThan(0);
    expect(
      found
        .filter((c) => c.n !== registered.length)
        .map((c) => `${c.path}: ${c.n}`),
    ).toEqual([]);
  });

  it("names no hidden type in a sentence that states a count", () => {
    // what-is-neoboard listed radar and choropleth right after the count.
    const offending = DOCS.flatMap(({ path, text }) =>
      text
        .split("\n")
        .filter((line) => new RegExp(COUNT.source).test(line))
        .filter((line) =>
          disabled.some((t) => new RegExp(`\\b${t}\\b`, "i").test(line)),
        )
        .map(() => path),
    );
    expect(offending).toEqual([]);
  });

  it("what-is-neoboard lists exactly the picker's types after its count", () => {
    const m = /\*\*(\d+) chart types\*\* -- (.+)$/m.exec(
      page("start-here/what-is-neoboard.mdx"),
    );
    expect(m).not.toBeNull(); // the list still has this shape
    const DISPLAY_TO_TYPE = { "graph-visualization": "graph", "json-viewer": "json" };
    const listed = m[2]
      .split(/,\s*(?:and\s+)?/)
      .map((name) => name.trim().toLowerCase().replace(/\s+/g, "-"))
      .map((s) => DISPLAY_TO_TYPE[s] ?? s);
    expect(listed.length).toBe(Number(m[1]));
    expect([...listed].sort()).toEqual([...selectable].sort());
  });

  it("the chart index offers exactly the picker's types, and recommends no hidden one", () => {
    const index = page("charts/index.mdx");
    const SLUG_TO_TYPE = { "param-select": "parameter-select" };
    const listed = [
      ...section(index, "Available Chart Types").matchAll(
        /^\| \[[^\]]+\]\(\/charts\/([\w-]+)\)/gm,
      ),
    ].map((m) => SLUG_TO_TYPE[m[1]] ?? m[1]);
    expect([...listed].sort()).toEqual([...selectable].sort());
    const choosing = section(index, "Choosing a Chart Type");
    expect(choosing).not.toBe(""); // the heading still exists
    expect(disabled.filter((t) => choosing.includes(`(/charts/${t})`))).toEqual(
      [],
    );
  });
});

describe("the documented parameter types are the ones the editor offers (#1782)", () => {
  // Number, Boolean and Slider were documented on two pages and never
  // existed; Relative Date and Number Range existed and were not documented.
  // The editor's resolveInternalParamType is the authority: it maps every
  // choice a user can make to the type that gets stored.
  const src = (f) => readFileSync(join(ROOT, f), "utf8");
  const body =
    src("app/src/components/widget-editor/parameter-config-section.tsx")
      .split("export function resolveInternalParamType")[1]
      ?.split("\n}")[0] ?? "";
  // Only the strings it returns: after `return`, `?` or `:`.
  const offered = [
    ...new Set(
      [...body.matchAll(/(?:return|\?|:)\s*"([\w-]+)"/g)].map((m) => m[1]),
    ),
  ];
  const doc = (p) =>
    DOCS.find(({ path }) => path === `docs/src/content/docs/${p}`)?.text ?? "";

  it("reads the editor", () => {
    expect(offered).toContain("select"); // the regex still matches
    expect(offered).toContain("date-relative");
  });

  it.each([
    "using/parameters.mdx",
    "charts/param-select.mdx",
    "using/widgets.mdx",
  ])(
    "%s lists exactly those types",
    (p) => {
      // widgets.mdx titles its section "Parameter Widgets" and its column
      // "Parameter type", so match either heading and skip the header rows.
      const table =
        doc(p).split(/\n## Parameter (?:Types|Widgets)\n/)[1]?.split("\n## ")[0] ??
        "";
      const DISPLAY_TO_TYPE = {
        freetext: "text",
        "relative-date": "date-relative",
      };
      const types = [...table.matchAll(/^\| ([^|]+?)\s+\|/gm)]
        .slice(1) // the header; `|----|` has no space, so it never matches
        .map((m) => m[1])
        .map((cell) => cell.toLowerCase().replace(/\s+/g, "-"))
        .map((s) => DISPLAY_TO_TYPE[s] ?? s);
      expect([...types].sort()).toEqual([...offered].sort());
    },
  );

  it("the contributor guide shows the ParameterType union the store declares", () => {
    const union = (text) => [
      ...(/type ParameterType =([^;]+);/.exec(text)?.[1] ?? "").matchAll(
        /"([\w-]+)"/g,
      ),
    ].map((m) => m[1]);
    const store = union(src("app/src/stores/parameter-store.ts"));
    expect(store.length).toBeGreaterThan(0);
    expect(
      union(doc("extend/new-parameter-type.mdx")).filter(
        (t) => t !== "your-type",
      ),
    ).toEqual(store);
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
    const site = gitGrep(
      "neoboard\\.app/docs/[A-Za-z0-9_./-]*",
      SITE_LINK_PATHS,
    );
    expect(site.length).toBeGreaterThan(0);
    const { pages, siteProblems } = repoLinks();
    expect(siteProblems).toEqual([]);
    const dead = [
      ...site.map(({ path, line, match }) => ({
        path,
        line,
        slug: match.slice("neoboard.app/docs".length),
      })),
      ...pages,
    ]
      // The site root is index.mdx, whose pageSlug is "" (#1217).
      .map(({ path, line, slug }) => ({
        path,
        line,
        slug: slug.replace(/\/+$/, ""),
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
    expect(repoLinks().branchProblems).toEqual([]);
  });

  // The two checks above, rehearsed on a copy where the org transfer (#1213)
  // renamed the owner: in the compose image, in the links, or in some of them.
  const NEXT_OWNER = "graphwave-consulting";
  const rehearse = ({
    compose = (t) => t.replaceAll(ownerRepo().owner, NEXT_OWNER),
    links = (t) => t.replaceAll(ownerRepo().owner, NEXT_OWNER),
    plugins = "",
    page = "",
  } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "neoboard-1781-"));
    try {
      for (const [file, edit, extra] of [
        ["docker/docker-compose.prod-full.yml", compose, ""],
        ["PLUGINS.md", links, plugins],
        ["docs/src/content/docs/extend/architecture.mdx", links, page],
      ]) {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        writeFileSync(
          join(dir, file),
          edit(readFileSync(join(ROOT, file), "utf8")) + extra,
        );
      }
      execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
      execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
      const { siteProblems, branchProblems } = repoLinks(dir);
      return [...siteProblems, ...branchProblems];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("follows the owner the compose image names, and fails when its links match nothing (#1781)", () => {
    const { repo } = ownerRepo();
    const keep = (t) => t;
    expect(rehearse({ compose: keep, links: keep })).toEqual([]);
    expect(rehearse()).toEqual([]);
    // Links renamed, compose not: the checks must not pass over no links.
    expect(rehearse({ compose: keep })).not.toEqual([]);
    // Every link moved off the pattern: a stale pattern, not a clean tree.
    expect(
      rehearse({
        links: (t) =>
          t
            .replaceAll(ownerRepo().owner, NEXT_OWNER)
            .replaceAll(`/${repo}/`, `/${repo}-next/`),
      }),
    ).toEqual([expect.stringMatching(/^no /), expect.stringMatching(/^no /)]);
  });

  it("reports a link the rename left on the old owner (#1781)", () => {
    // Pages URLs do not redirect after a transfer: the old host is a 404.
    const { owner, repo } = ownerRepo();
    expect(
      rehearse({
        plugins: `\n[old](https://${owner}.github.io/${repo}/extend/)\n`,
        page: `\n[old](https://github.com/${owner}/${repo}/blob/dev/ARCHITECTURE.md)\n`,
      }),
    ).toEqual([
      expect.stringContaining(`${owner}.github.io/${repo}/extend/`),
      expect.stringContaining(`github.com/${owner}/${repo}/blob/dev`),
    ]);
  });

  it("matches the owner in any case, as GitHub and Pages do (#1781)", () => {
    // Compose must spell the owner in lowercase; a link need not, nor its host.
    const { repo } = ownerRepo();
    expect(
      rehearse({
        plugins: `\n[x](https://GraphWave-Consulting.GitHub.io/${repo}/no-such-page/)\n`,
        page: `\n[x](https://GitHub.com/GraphWave-Consulting/${repo}/blob/release/1.1/ARCHITECTURE.md)\n`,
      }),
    ).toEqual([expect.stringContaining("blob/release/1.1")]);
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

    // Both are copies of env-config.ts. Page == example only proves the two
    // copies agree; a variable added to the registry and documented on the
    // Configuration page still left this table — "Every option reads these
    // at boot" — silently short. NEXTAUTH_URL is the page's deliberate
    // operational addition, hence arrayContaining, not equality.
    const fromRegistry = requiredFromRegistry();
    expect(fromPage).toEqual(expect.arrayContaining(fromRegistry));
    expect(fromExample).toEqual(expect.arrayContaining(fromRegistry));
  });

  it("generates the secrets once, before the first run, and never again", () => {
    // The systemd step said "move the configuration into a root-only file"
    // and then ran `openssl rand` again for every secret — a reader who
    // followed it rotated ENCRYPTION_KEY between the foreground run that
    // created the schema and first admin and the unit that took over,
    // losing every credential stored in between.
    const body = page();
    const option1 = body.slice(
      body.indexOf("## Option 1"),
      body.indexOf("## Option 2"),
    );
    const generated = option1.match(/ENCRYPTION_KEY=\$\(openssl rand/g) ?? [];
    expect(generated).toHaveLength(1);
    expect(option1.indexOf("ENCRYPTION_KEY=$(openssl rand")).toBeLessThan(
      option1.indexOf("node app/server.js"),
    );
    // The foreground run reads the file the unit will read, rather than
    // taking its own inline copy of the secrets.
    const foreground =
      option1.match(/```bash\n[^`]*node app\/server\.js[^`]*```/)?.[0] ?? "";
    expect(foreground).toContain("/etc/neoboard.env");
    expect(foreground).not.toMatch(/ENCRYPTION_KEY=/);
    // The token lives in a 0600 root file; the reader is told how to see it.
    expect(option1).toMatch(/grep ADMIN_BOOTSTRAP_TOKEN \/etc\/neoboard\.env/);
  });

  it("never expands the env file onto a command line", () => {
    // `env $(sudo cat /etc/neoboard.env)` put every secret in sudo's argv:
    // sudo logs the full command to auth.log, and `ps` shows it to every
    // local user for the life of the run. Source the file in a root shell
    // and drop privileges after, as the systemd unit does.
    for (const { path, text } of DOCS) {
      expect(text, path).not.toMatch(/\$\((?:sudo\s+)?cat\s+[^)]*\.env\b/);
    }
    const foreground =
      page().match(/```bash\n[^`]*node app\/server\.js[^`]*```/)?.[0] ?? "";
    expect(foreground).toMatch(/\. \/etc\/neoboard\.env/);
  });

  it("gives every option a first admin", () => {
    // Self-registration is closed by default and signup.ts refuses the
    // first admin without ADMIN_BOOTSTRAP_TOKEN, so an option that sets only
    // the required variables ends in a healthy pod nobody can log into.
    const body = page();
    const options = body.split(/^## Option /m).slice(1);
    expect(options.length).toBeGreaterThan(1);
    for (const option of options) {
      expect(option).toContain("ADMIN_BOOTSTRAP_TOKEN");
      expect(option).toContain("/deploy/production#3-create-the-first-admin");
    }
  });

  it("does not call replicas safe while rate limiting is per-process", () => {
    // migrate-on-boot serializes on pg_advisory_lock, so migrations are
    // replica-safe. The rate limiter on the public /api/auth/* routes (#819)
    // is an in-memory Map per process, so N replicas hand every IP N times
    // the budget. The page must say the second half, not just the first.
    const limiter = readFileSync(
      join(ROOT, "app/src/lib/crypto/rate-limiter.ts"),
      "utf8",
    );
    expect(limiter).toMatch(/single-instance/); // still the reason
    const body = page();
    const replicas = body.match(/^- \*\*Replicas\.\*\*.*$/m)?.[0] ?? "";
    expect(replicas).not.toBe("");
    expect(replicas).not.toMatch(/safe to raise/i);
    expect(replicas).toMatch(/rate.limit/i);
    expect(replicas).toMatch(/advisory lock/);
  });

  it("names only the image that is published", () => {
    // reverse-proxy's Traefik example pulled neoboard/community:latest —
    // an image that does not exist; everything else says ghcr.io/....
    const offenders = DOCS.filter(({ text }) =>
      text.includes("neoboard/community"),
    ).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("pins image tags the way release.yml publishes them (X.Y.Z, X.Y — no v)", () => {
    // docker/metadata-action's type=semver strips the tag's leading v, so
    // ghcr.io/.../neoboard:vX.Y.Z is a pull that fails. The prod compose
    // files' rollback comments are copied as often as the docs are.
    const read = (path) => readFileSync(join(ROOT, path), "utf8");
    expect(read(".github/workflows/release.yml")).toMatch(
      /type=semver,pattern=\{\{version\}\}/,
    ); // still why
    const compose = [
      "docker/docker-compose.prod.yml",
      "docker/docker-compose.prod-full.yml",
    ].map((path) => ({ path, text: read(path) }));
    const offenders = [...DOCS, ...compose]
      .filter(({ text }) => /neoboard:v/.test(text))
      .map(({ path }) => path);
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

describe("production deployment: secrets survive a second paste (#1217)", () => {
  // `export ENCRYPTION_KEY=$(openssl rand ...)` makes a new key on every
  // paste: stored credentials become unrecoverable and the initialised
  // Postgres volume keeps the old POSTGRES_PASSWORD. README.md was fixed in
  // #1217; this holds the site page it links to the same snippet.
  const PAGE = "docs/src/content/docs/deploy/production.mdx";
  const COMPOSE = "docker/docker-compose.prod-full.yml";
  const page = () => DOCS.find(({ path }) => path === PAGE)?.text ?? "";

  it("no page exports a freshly generated secret", () => {
    const offenders = DOCS.filter(({ text }) =>
      /export\s+[A-Z_]+=\$\(openssl rand/.test(text),
    ).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("writes the secrets once into a 0600 file, and refuses a second paste", () => {
    const block = /\(set -o noclobber[\s\S]*?\nEOF\n\)/.exec(page())?.[0] ?? "";
    expect(block).not.toBe("");
    const envFile = /cat > (\S+) <</.exec(block)[1];
    const required = [
      ...readFileSync(join(ROOT, COMPOSE), "utf8").matchAll(/\$\{(\w+):\?/g),
    ].map((m) => m[1]);
    const dir = mkdtempSync(join(tmpdir(), "neoboard-1217-"));
    try {
      mkdirSync(join(dir, "docker"));
      const paste = () =>
        spawnSync("bash", ["-c", block], { cwd: dir, encoding: "utf8" });
      expect(paste().status).toBe(0);
      const file = join(dir, envFile);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      const first = readFileSync(file, "utf8");
      for (const key of [...required, "ADMIN_BOOTSTRAP_TOKEN"])
        expect(first, key).toMatch(new RegExp(`^${key}=\\S+$`, "m"));
      expect(paste().status).not.toBe(0);
      expect(readFileSync(file, "utf8")).toBe(first);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // Every compose command on the page reads that file; without it the
    // `:?` secrets are unset and compose refuses to start.
    const commands = page().match(/^docker compose .*$/gm) ?? [];
    expect(commands.length).toBeGreaterThan(0);
    expect(
      commands.filter(
        (c) => !c.includes(`--env-file ${envFile} -f ${COMPOSE}`),
      ),
    ).toEqual([]);
  });

  it("the compose file's usage comment passes the same env file", () => {
    const header = readFileSync(join(ROOT, COMPOSE), "utf8").split(
      /^services:/m,
    )[0];
    expect(header).not.toContain("cp ../app/.env.example .env");
    const commands = header.match(/docker compose .*/g) ?? [];
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.filter((c) => !c.includes("--env-file"))).toEqual([]);
  });
});

describe("air-gapped install (#1683)", () => {
  const PAGE = "docs/src/content/docs/deploy/air-gapped.mdx";
  const page = () => DOCS.find(({ path }) => path === PAGE)?.text ?? "";

  it("describes the map's Tile Layer option as it is (#1705)", () => {
    // Read the option schema and hold the page to it — when the field
    // changes, this flips and the page has to follow.
    const schema = readFileSync(
      join(ROOT, "component/src/components/composed/chart-options/map.ts"),
      "utf8",
    );
    const option = (key) => {
      const start = schema.indexOf(`key: "${key}"`);
      return start < 0
        ? ""
        : schema.slice(start, schema.indexOf("\n  {", start));
    };
    const tile = option("tileLayer");
    expect(tile).not.toBe("");
    const body = page();
    const section = body.slice(
      body.indexOf("### Map basemap tiles"),
      body.indexOf("### API docs page"),
    );
    expect(section).not.toBe("");
    expect(section.includes("`none`")).toBe(/"none"/.test(tile));
    expect(/own tile server/.test(section)).toBe(/type: "text"/.test(tile));
    expect(section.includes("**Attribution**")).toBe(
      option("attribution") !== "",
    );
    expect(/openstreetmap/i.test(section)).toBe(/openstreetmap/.test(tile));
    expect(/carto/i.test(section)).toBe(/carto/i.test(tile));
  });
});

describe("the connector-author page compiles against the SDK (#1697)", () => {
  // The page predated @neoboard/connector-sdk: it imported from core-relative
  // paths, told authors to edit connector-registry.ts, and its runQuery
  // called `callbacks.setRecords` / `setError` — neither exists on
  // QueryCallback. Every one of those is a type error, so the compiler is
  // the check: each TypeScript block names its file on line 1, the blocks
  // are written out as one package beside the page's own package.json and
  // tsconfig.json, and tsc runs them against connector-sdk/src. Pseudo-code
  // therefore may not use a TypeScript fence — a shape sketch goes in prose
  // or a ```txt fence.
  const PAGE = "docs/src/content/docs/extend/new-connector-plugin.mdx";
  const OUT = join(ROOT, "scripts/__tests__/fixtures/docs-ts-blocks/.out");
  const TSC = join(ROOT, "node_modules/typescript/bin/tsc");
  const SDK = "@neoboard/connector-sdk";
  const page = () => DOCS.find(({ path }) => path === PAGE)?.text ?? "";
  const prose = () => page().replace(/\s+/g, " ");
  // Every fence whose info string names TypeScript: matching ```ts alone let
  // a ```typescript block skip both the name check and the typecheck.
  const tsBlocks = () =>
    [
      ...page().matchAll(
        /```(?:ts|tsx|mts|cts|typescript)\b[^\n]*\n([\s\S]*?)```/g,
      ),
    ].map((m) => m[1]);
  const fileOf = (code) => code.match(/^\/\/ ([\w./-]+\.ts)(\s|$)/)?.[1];
  /** The body of the fence the page titles `name` (```json title="name"). */
  const titled = (name) =>
    page().match(
      new RegExp('```\\w+ title="' + name + '"\\n([\\s\\S]*?)```'),
    )?.[1];
  const tsc = (args) =>
    spawnSync(process.execPath, [TSC, ...args], { encoding: "utf8" });

  it("names the file on the first line of every TypeScript block, once", () => {
    const blocks = tsBlocks();
    expect(blocks.length).toBeGreaterThan(3); // the fence regex still matches
    const unnamed = blocks
      .filter((code) => !fileOf(code))
      .map((code) => code.split("\n")[0]);
    expect(unnamed).toEqual([]);
    // Blocks are written out by name, so a second block with the same name
    // would silently replace the first and never be compiled.
    const names = blocks.map(fileOf);
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  });

  it("imports nothing but the SDK, vitest and the package's own files", () => {
    // The page says the package imports only the SDK. tsc cannot hold it to
    // that: .out sits inside the repo, so `@neoboard/connection` resolves
    // through the root node_modules and compiles.
    const blocks = tsBlocks();
    const own = new Set(blocks.map(fileOf));
    const imports = blocks.flatMap((code) =>
      [...code.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
        (m) => ({ file: fileOf(code) ?? "", spec: m[1] }),
      ),
    );
    expect(imports.map(({ spec }) => spec)).toContain(SDK); // regex still matches
    const outside = imports
      .filter(({ file, spec }) =>
        spec.startsWith(".")
          ? !own.has(
              posix.join(posix.dirname(file), spec).replace(/\.js$/, ".ts"),
            )
          : spec !== SDK && spec !== "vitest",
      )
      .map(({ file, spec }) => `${file}: ${spec}`);
    expect(outside).toEqual([]);
  });

  it("typechecks the blocks with the page's own package.json and tsconfig.json", () => {
    // Compiled the way Node loads the package: the page's "type": "module"
    // and NodeNext settings, where an extensionless relative import is
    // TS2835. Bundler resolution accepted those imports, and the package
    // they produced could not be loaded.
    const pkg = titled("package.json");
    const tsconfig = titled("tsconfig.json");
    expect(pkg).toBeDefined();
    expect(tsconfig).toBeDefined();
    rmSync(OUT, { recursive: true, force: true });
    try {
      mkdirSync(OUT, { recursive: true });
      for (const [i, code] of tsBlocks().entries()) {
        const file = join(OUT, fileOf(code) ?? `block-${i}.ts`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, code);
      }
      writeFileSync(join(OUT, "package.json"), pkg);
      writeFileSync(join(OUT, "tsconfig.page.json"), tsconfig);
      // Only what the harness adds: no emit, the tests too, the SDK mapped to
      // its source so nothing needs building, and a rootDir wide enough to
      // hold that source.
      writeFileSync(
        join(OUT, "tsconfig.json"),
        JSON.stringify({
          extends: "./tsconfig.page.json",
          compilerOptions: {
            noEmit: true,
            rootDir: ROOT,
            paths: { [SDK]: [join(ROOT, "connector-sdk/src/index.ts")] },
          },
          include: ["**/*.ts"],
        }),
      );
      const result = tsc(["-p", OUT]);
      expect(result.stdout + result.stderr).toBe("");
      expect(result.status).toBe(0);
    } finally {
      rmSync(OUT, { recursive: true, force: true });
    }
  });

  it("says `neoboard plugin add` fails exactly while Node cannot load the SDK's build", () => {
    // The CLI validates a package with a plain Node import() and uninstalls
    // it when that throws (cli/src/commands/plugin.ts). A connector imports
    // the SDK's base classes at runtime, so `plugin add` works only once Node
    // can load the SDK as it is built. Build it with its own config, try,
    // and hold the page to the answer in both directions.
    const sdk = join(OUT, "sdk");
    rmSync(OUT, { recursive: true, force: true });
    try {
      mkdirSync(sdk, { recursive: true });
      // Its package.json decides how Node reads dist/ ("type").
      writeFileSync(
        join(sdk, "package.json"),
        readFileSync(join(ROOT, "connector-sdk/package.json")),
      );
      const build = tsc([
        "-p",
        join(ROOT, "connector-sdk/tsconfig.build.json"),
        "--outDir",
        join(sdk, "dist"),
        "--declaration",
        "false",
        "--declarationMap",
        "false",
        "--sourceMap",
        "false",
      ]);
      expect(build.stdout + build.stderr).toBe("");
      const load = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `await import(${JSON.stringify(pathToFileURL(join(sdk, "dist/index.js")).href)})`,
        ],
        { encoding: "utf8" },
      );
      const saysItFails = prose().includes(
        "`neoboard plugin add` does not work for a connector built on the SDK yet",
      );
      expect(saysItFails, load.stderr.slice(0, 400)).toBe(load.status !== 0);
    } finally {
      rmSync(OUT, { recursive: true, force: true });
    }
  });

  it("states the chart-type and template gates while the code still has them", () => {
    // A connection of a registry-supplied type can be created and queried,
    // but two gates list only the built-in types. Each check reads the line
    // that imposes its gate, so the page has to change when the gate does.
    const src = (path) => readFileSync(join(ROOT, path), "utf8");
    expect(
      prose().includes("treats no chart type as compatible with your type"),
    ).toBe(
      src("app/src/lib/plugin/chart-helpers.ts").includes(
        "if (!CONNECTOR_TYPES.includes(connectorType as ConnectorType)) return [];",
      ),
    );
    expect(prose().includes("the widget-templates API rejects")).toBe(
      src("app/src/app/api/widget-templates/route.ts").includes(
        "connectorType: z.enum(CONNECTOR_TYPES),",
      ),
    );
  });

  it("lists no community connector that does not exist", () => {
    // PLUGINS.md and the Community page both offered
    // `neoboard plugin add neoboard-connector-mongodb` as an "Example". No
    // such package or repo exists; the command fails at npm install. The
    // MongoDB connector is planned (#1702) and is listed as such.
    const phantom = [
      readFileSync(join(ROOT, "PLUGINS.md"), "utf8"),
      DOCS.find(({ path }) => path.endsWith("/extend/community.mdx"))?.text ??
        "",
    ].flatMap(
      (text) =>
        text.match(/plugin add neoboard-connector-mongodb|Example\s*\|/g) ?? [],
    );
    expect(phantom).toEqual([]);
  });
});

describe("Tour NeoBoard with demo data (#1682)", () => {
  // `neoboard demo` was documented as a command-table row, and the hand-taken
  // screenshots in docs/public/screenshots drift with every UI change. The
  // tour's images are written by app/e2e/showcase.walkthrough.ts instead —
  // regenerate them from app/ with
  //   DOCS_SCREENSHOTS=1 npx playwright test --config playwright.showcase.config.ts
  // — so the page, the spec and the committed files must name the same
  // images, and the page must name the logins and showcases the demo creates.
  const PAGE = "docs/src/content/docs/start-here/tour.mdx";
  const SHOTS_DIR = join(ROOT, "docs/public/screenshots/tour");
  const page = () => DOCS.find(({ path }) => path === PAGE)?.text ?? "";
  const text = (p) => DOCS.find(({ path }) => path === p)?.text ?? "";
  const walkthrough = () =>
    readFileSync(join(ROOT, "app/e2e/showcase.walkthrough.ts"), "utf8");

  it("references only images that exist under docs/public", () => {
    // The link checks above only follow leading-slash `](/x.png)` targets. An
    // `<img src>` or a relative image path passes them and renders broken.
    const missing = [];
    let seen = 0;
    for (const { path, text: body } of DOCS)
      for (const m of body.matchAll(
        /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)|<img\b[^>]*?\ssrc=["']([^"']+)["']/g,
      )) {
        seen++;
        const src = (m[1] ?? m[2]).replace(/[?#].*$/, "");
        if (/^(https?:|data:)/.test(src)) continue;
        if (!src.startsWith("/") || !existsSync(join(ROOT, "docs/public", src)))
          missing.push(`${src} (${path})`);
      }
    expect(seen).toBeGreaterThan(0); // the image regex still matches
    expect(missing).toEqual([]);
  });

  it("shows exactly the screenshots the walkthrough writes, committed at 1280x1024", () => {
    const written = [
      ...new Set(
        [...walkthrough().matchAll(/docsShot\(\s*page,\s*"([\w-]+)"\s*\)/g)].map(
          (m) => `${m[1]}.png`,
        ),
      ),
    ].sort();
    expect(written.length).toBeGreaterThan(0); // the call regex still matches
    const shown = [
      ...new Set(
        [...page().matchAll(/\(\/screenshots\/tour\/([\w-]+\.png)\)/g)].map(
          (m) => m[1],
        ),
      ),
    ].sort();
    expect(shown).toEqual(written);
    // A renamed shot leaves its old file behind unless the directory is held
    // to the list.
    expect(
      readdirSync(SHOTS_DIR)
        .filter((f) => f.endsWith(".png"))
        .sort(),
    ).toEqual(written);
    for (const name of written) {
      // PNG IHDR: width and height are big-endian uint32s at bytes 16 and 20.
      const png = readFileSync(join(SHOTS_DIR, name));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], name).toEqual([
        1280, 1024,
      ]);
    }
  });

  it("regenerates the images only when asked, in the light theme", () => {
    // Ungated, every showcase run would overwrite the committed images.
    const spec = walkthrough();
    expect(spec).toMatch(
      /test\.skip\(\s*process\.env\.DOCS_SCREENSHOTS !== "1"/,
    );
    expect(spec).toMatch(/colorScheme:\s*"light"/);
  });

  it("is the Start here tour, offered from Install and Your first dashboard", () => {
    expect(page().match(/^title:\s*(.+)$/m)?.[1]).toBe(
      "Tour NeoBoard with demo data",
    );
    for (const from of ["install", "first-dashboard"])
      expect(text(`docs/src/content/docs/start-here/${from}.mdx`)).toContain(
        "](/start-here/tour)",
      );
  });

  it("gives the logins `neoboard demo` prints, not invented ones", () => {
    const cli = readFileSync(join(ROOT, "cli/src/commands/demo.ts"), "utf8");
    const printed = [...cli.matchAll(/(\w+@neoboard\.local) \/ (\w+)/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    expect(printed.length).toBeGreaterThan(0); // the banner regex still matches
    const documented = [
      ...page().matchAll(/`(\w+@neoboard\.local)`\s*\|\s*`(\w+)`/g),
    ].map((m) => `${m[1]} ${m[2]}`);
    expect(documented).toEqual(printed);
  });

  it("walks every showcase `neoboard demo` seeds", () => {
    expect(SHOWCASES.length).toBeGreaterThan(0);
    expect(
      SHOWCASES.map((s) => s.label).filter((label) => !page().includes(label)),
    ).toEqual([]);
  });
});
