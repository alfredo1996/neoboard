import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DISABLED_CHART_TYPES } from "@/plugins/disabled-chart-types";

/**
 * Guards the repo's own documentation against drift (#1235).
 *
 * .claude/CLAUDE.md is loaded as ground truth by agent sessions, so a stale path or
 * count there becomes a wrong assumption in generated code. These tests fail
 * loudly instead.
 *
 * Scope: the repo's OWN docs (.claude/CLAUDE.md, ARCHITECTURE.md, .claude/skills).
 * The published site under docs/src has its own guard —
 * scripts/__tests__/docs-accuracy.test.mjs — with the same name and a
 * different target. Add site checks there, repo checks here.
 */

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const readDoc = (name: string) =>
  readFileSync(resolve(REPO_ROOT, name), "utf8");

/** Top-level dirs that make a backticked token a repo path rather than an npm specifier. */
const REPO_PREFIXES = [
  "app/",
  "component/",
  "connection/",
  "connector-sdk/",
  "cli/",
  "docs/",
  "scripts/",
  ".claude/",
  ".github/",
  "docker/",
];

function referencedPaths(markdown: string): string[] {
  const backticked = markdown.match(/`[^`\s]+`/g) ?? [];
  return [
    ...new Set(
      backticked
        .map((t) => t.slice(1, -1))
        .filter((t) => REPO_PREFIXES.some((p) => t.startsWith(p))),
    ),
  ];
}

const countFiles = (dir: string, ext = ".tsx") =>
  readdirSync(resolve(REPO_ROOT, dir)).filter((f) => f.endsWith(ext)).length;

/**
 * The registry is the authority: `app/src/plugins/index.ts` imports one
 * `<name>Plugin` per plugin directory. Counting directories instead would
 * include `transforms/`, a shared utility module that is not a plugin.
 */
const registeredPlugins = (): string[] => [
  ...new Set(
    [
      ...readDoc("app/src/plugins/index.ts").matchAll(
        /import \{ \w+Plugin \} from "\.\/([\w-]+)";/g,
      ),
    ].map((m) => m[1]),
  ),
];

describe("documentation accuracy", () => {
  describe.each([".claude/CLAUDE.md", "ARCHITECTURE.md"])("%s", (docName) => {
    it("references only file paths that exist", () => {
      const missing = referencedPaths(readDoc(docName)).filter(
        (p) => !existsSync(resolve(REPO_ROOT, p)),
      );
      expect(missing).toEqual([]);
    });
  });

  describe("ARCHITECTURE.md component counts match the filesystem", () => {
    // Each regex must match: a reworded claim should fail here rather than
    // silently stop being checked.
    it.each([
      [
        "shadcn/ui primitives",
        /(\d+) shadcn\/ui primitives/,
        () => countFiles("component/src/components/ui"),
      ],
      [
        "composed components",
        /(\d+) higher-order components/,
        () => countFiles("component/src/components/composed"),
      ],
      [
        "chart modules",
        /BaseChart \+ (\d+) types/,
        // charts/ holds base-chart.tsx plus one module per chart type.
        () => countFiles("component/src/charts") - 1,
      ],
    ])("%s", (_label, pattern, actual) => {
      const match = readDoc("ARCHITECTURE.md").match(pattern);
      expect(
        match,
        `claim matching ${pattern} not found — was it reworded?`,
      ).not.toBeNull();
      expect(Number(match![1])).toBe(actual());
    });
  });

  it(".claude/CLAUDE.md documents MIGRATE_ON_START, not a --skip-migrations flag", () => {
    // Naming the flag to debunk it is fine (readers search for it); asserting
    // it exists is not. The real escape hatch is MIGRATE_ON_START=0 (#1222).
    const doc = readDoc(".claude/CLAUDE.md");
    expect(doc).toContain("MIGRATE_ON_START");
    // Assert the canonical debunk is present rather than blocklisting one
    // phrasing — "use `--skip-migrations`" would slip past a negative regex.
    expect(doc).toContain("there is no `--skip-migrations` CLI flag");
  });

  it(".claude/CLAUDE.md points at the tenant guard by path, and that path exists", () => {
    // The section used to say a forgotten tenant filter is "a leak that
    // nothing catches. Adding a guard is tracked in #1226." The guard shipped
    // (#1351), so that was false in a direction that changes behaviour: an
    // agent reading it would either duplicate the guard or reason more
    // defensively than the code requires (#1355).
    //
    // Pinned by PATH rather than by phrasing, so a rewrite that drops the
    // pointer fails while a rewrite that keeps it is free to reword.
    const doc = readDoc(".claude/CLAUDE.md");
    const guardPath = "app/src/lib/db/__tests__/tenant-scope.test.ts";
    expect(doc).toContain(guardPath);
    expect(existsSync(resolve(REPO_ROOT, guardPath))).toBe(true);

    // The mandate itself is load-bearing and must survive any rewording: the
    // ratchet is a test-time safety net, NOT runtime enforcement. An agent
    // that believes the ORM scopes queries will write an unscoped one.
    expect(doc).toMatch(/per query, in the route/);
    expect(doc).toMatch(/not runtime enforcement/);

    // And the stale claim must stay gone. Asserting only that the NEW text is
    // present would pass if someone reintroduced "nothing catches it /
    // tracked in #1226" alongside it — leaving the document contradicting
    // itself, which is worse for a reader than either version alone.
    expect(doc).not.toMatch(/tracked in #1226/i);
    expect(doc).not.toMatch(/leak that nothing catches/i);
  });

  describe.each(["ARCHITECTURE.md", ".github/SECURITY.md"])(
    "%s describes multi-tenancy as it is enforced",
    (docName) => {
      it("states the per-query mandate and names the ratchet", () => {
        // Both documents claimed isolation happened "at the ORM level" /
        // "at ORM/middleware level" while app/src/lib/db/index.ts is a plain
        // Drizzle client with no middleware. CLAUDE.md was corrected for this
        // in #1355; these two were not. SECURITY.md is a published policy, so
        // the overstatement is a guarantee the code does not make (#1572).
        const doc = readDoc(docName);
        const guardPath = "app/src/lib/db/__tests__/tenant-scope.test.ts";
        expect(doc).toContain(guardPath);
        expect(existsSync(resolve(REPO_ROOT, guardPath))).toBe(true);
        expect(doc).toMatch(/per query/i);
      });

      it("does not claim ORM, middleware or database-layer enforcement", () => {
        // Blocklist every phrasing that shipped, not just the one being
        // removed: asserting only that the new text is present would pass
        // while the old sentence sat beside it.
        const doc = readDoc(docName);
        expect(doc).not.toMatch(/at the ORM level/i);
        expect(doc).not.toMatch(/ORM\/middleware/i);
        expect(doc).not.toMatch(/prevented at the database layer/i);
      });
    },
  );

  describe("ARCHITECTURE.md counts match the filesystem", () => {
    // The counts above live in fenced code blocks, which referencedPaths()
    // never inspects — which is how six of them drifted while the three
    // backticked component counts stayed correct (#1572).
    const doc = () => readDoc("ARCHITECTURE.md");

    it("counts chart plugins", () => {
      const claimed = /Chart plugin definitions \((\d+)\)/.exec(doc());
      expect(
        claimed,
        "ARCHITECTURE.md no longer states a plugin count",
      ).not.toBeNull();
      expect(Number(claimed![1])).toBe(registeredPlugins().length);
    });

    it("counts API routes", () => {
      const walk = (dir: string): number =>
        readdirSync(resolve(REPO_ROOT, dir), { withFileTypes: true }).reduce(
          (n, e) =>
            n +
            (e.isDirectory()
              ? walk(`${dir}/${e.name}`)
              : e.name === "route.ts"
                ? 1
                : 0),
          0,
        );
      const claimed = /(\d+) API routes/.exec(doc());
      expect(
        claimed,
        "ARCHITECTURE.md no longer states a route count",
      ).not.toBeNull();
      expect(Number(claimed![1])).toBe(walk("app/src/app/api"));
    });

    it("counts Zustand stores", () => {
      const actual = countFiles("app/src/stores", ".ts");
      const claimed = /Zustand stores \((\d+)\)/.exec(doc());
      expect(
        claimed,
        "ARCHITECTURE.md no longer states a store count",
      ).not.toBeNull();
      expect(Number(claimed![1])).toBe(actual);
    });

    it("lists exactly the plugins the registry loads", () => {
      const listed = /\*\*(\d+) chart plugins:\*\* ([^\n]+)/.exec(doc());
      expect(
        listed,
        "ARCHITECTURE.md no longer lists chart plugins",
      ).not.toBeNull();
      const names = listed![2].split(",").map((n) => n.trim());
      expect([...names].sort()).toEqual([...registeredPlugins()].sort());
      expect(Number(listed![1])).toBe(names.length);
    });
  });

  describe("stated chart counts match the registry (#1687, #1782)", () => {
    // Unregistering two charts was swept with grep, which missed README.md,
    // PLUGINS.md and two journey narrations. Pinning every stated count here
    // makes the next unregistration fail a test instead.
    //
    // A reader counts what the widget picker offers, not what is registered:
    // radar and choropleth stay registered so old dashboards render, but the
    // picker hides them (#1158), so "18 chart types" promised two a user
    // cannot add (#1782). PLUGINS.md and ARCHITECTURE.md count registrations.
    const CLAIM = /\b(\d+) (?:built-in )?chart(?: types|s)\b/g;
    const selectable = () =>
      registeredPlugins().filter((t) => !DISABLED_CHART_TYPES.has(t));

    it.each([
      "README.md",
      "scripts/record-journeys/journeys/00-full-tour.mjs",
      "scripts/record-journeys/journeys/03-chart-gallery-tour.mjs",
    ])("%s", (docName) => {
      const claims = [...readDoc(docName).matchAll(CLAIM)].map((m) =>
        Number(m[1]),
      );
      expect(claims, `${docName} no longer states a chart count`).not.toEqual(
        [],
      );
      expect(claims).toEqual(claims.map(() => selectable().length));
    });

    it("the charts overview lists exactly the types the picker offers", () => {
      // The README's features table used to carry this list; it went in #1861,
      // and the docs page it points readers to is now the one list.
      const doc = readDoc("docs/src/content/docs/charts/index.mdx");
      const table = doc
        .slice(doc.indexOf("## Available Chart Types"))
        .split(/\n## /)[0];
      // Each row links its page, and the page slug is the type id, with one
      // exception.
      const SLUG_TO_TYPE: Record<string, string> = {
        "param-select": "parameter-select",
      };
      const types = [
        ...table.matchAll(/^\| \[[^\]]+\]\(\/charts\/([\w-]+)\)/gm),
      ].map((m) => SLUG_TO_TYPE[m[1]] ?? m[1]);
      expect(
        types.length,
        "the charts overview lost its table",
      ).toBeGreaterThan(0);
      expect([...types].sort()).toEqual([...selectable()].sort());
    });

    it("PLUGINS.md lists exactly the plugins the registry loads", () => {
      const doc = readDoc("PLUGINS.md");
      const heading = /## Built-in Charts \((\d+)\)/.exec(doc);
      expect(
        heading,
        "PLUGINS.md no longer states a chart count",
      ).not.toBeNull();
      // The table under the heading, up to the next section. Its first
      // column is a display name that slugs to the plugin directory, with
      // one exception.
      const table = doc.slice(heading!.index).split(/\n## /)[0];
      const rows = [...table.matchAll(/^\| ([^|]+?)\s+\|/gm)]
        .map((m) => m[1])
        .filter((cell) => cell !== "Chart Type" && !/^-+$/.test(cell));
      const DISPLAY_TO_TYPE: Record<string, string> = { "json-viewer": "json" };
      const slug = (label: string) => label.toLowerCase().replace(/\s+/g, "-");
      const types = rows.map((r) => DISPLAY_TO_TYPE[slug(r)] ?? slug(r));
      expect([...types].sort()).toEqual([...registeredPlugins()].sort());
      expect(Number(heading![1])).toBe(types.length);
    });
  });

  it("the deploy skill does not send auditors looking for a flag that does not exist", () => {
    // .claude/CLAUDE.md was corrected but the deploy skill still listed
    // "`--skip-migrations` flag missing or undocumented" as a gap to capture
    // — so the audit that produced #1222 was instructed to hunt a flag that
    // was never implemented. A prompt is documentation too (#1222).
    const skill = readDoc(".claude/skills/deploy/SKILL.md");
    expect(skill).toContain("MIGRATE_ON_START");
    expect(skill).toContain("there is no `--skip-migrations` CLI flag");
  });
});

describe("README.md works verbatim for a first-time reader (#1217)", () => {
  // The README is a stranger's first read, and the one doc nobody re-reads
  // after a rename: its badge pointed at ghcr.io/neoboard, an image
  // release.yml never published, and its production snippet regenerated
  // ENCRYPTION_KEY every time it was pasted.
  const readme = () => readDoc("README.md");
  const PROD_COMPOSE = "docker/docker-compose.prod-full.yml";

  /** The ```bash block that contains `needle`, or "". */
  const fence = (needle: string) =>
    (readme().match(/```bash\n[\s\S]*?```/g) ?? []).find((b) =>
      b.includes(needle),
    ) ?? "";

  /**
   * owner/repo, from the image the prod compose files pull. release.yml
   * publishes ghcr.io/<github.repository, lowercased> (#1780), so it is the
   * GitHub repo too.
   */
  const ownerRepo = () => {
    const m = /ghcr\.io\/([\w-]+)\/([\w-]+):latest/.exec(readDoc(PROD_COMPOSE));
    expect(m, `${PROD_COMPOSE} no longer names a ghcr image`).not.toBeNull();
    return { owner: m![1], repo: m![2] };
  };

  it("names only the image release.yml publishes", () => {
    const { owner, repo } = ownerRepo();
    const release = readDoc(".github/workflows/release.yml");
    expect(release).toContain(
      `echo "name=ghcr.io/$(echo "$GITHUB_REPOSITORY" | tr '[:upper:]' '[:lower:]')"`,
    );
    expect(release).toContain("images: ${{ steps.image.outputs.name }}");
    // ghcr only ever holds the lowercase name; a mixed-case ref fails to pull.
    expect(`${owner}/${repo}`).toBe(`${owner}/${repo}`.toLowerCase());
    // Badges URL-encode the slash (ghcr.io%2Fowner%2Frepo).
    const text = readme().replace(/%2F/gi, "/");
    const at = [...text.matchAll(/ghcr\.io/g)].map((m) => m.index);
    expect(at.length).toBeGreaterThan(0);
    expect(
      at
        .filter((i) => !text.startsWith(`ghcr.io/${owner}/${repo}`, i))
        .map((i) => text.slice(i, i + 40)),
    ).toEqual([]);
  });

  it("leads with the hybrid claim, not the NeoDash comparison (#1856)", () => {
    // The hero's tagline was "The modern alternative to NeoDash", and the first
    // reason to care was "NeoDash alternative". Neo4j has since shipped its own
    // successor — Dashboards in the Aura console, and in self-hosted Enterprise
    // Studio — so that framing compares NeoBoard to a tool its vendor already
    // replaced. Hybrid is the claim nothing else makes: no BI tool surveyed
    // reads a graph database natively, and no graph tool reads a relational one.
    const text = readme();

    // The italic line under the title carries the pitch.
    const tagline = /<em>([^<]+)<\/em>/.exec(text)?.[1] ?? "";
    expect(tagline, "the hero has no <em> tagline").not.toBe("");
    expect(tagline, "the hero tagline still leads on NeoDash").not.toMatch(
      /NeoDash/i,
    );

    // The first reason under "Why NeoBoard?" is the one people read.
    const why = text.slice(text.indexOf("## Why NeoBoard?"));
    const firstBullet = why.split("\n").find((l) => l.startsWith("- ")) ?? "";
    expect(firstBullet, "no bullets under Why NeoBoard?").not.toBe("");
    expect(firstBullet, "the first reason does not name Neo4j").toMatch(
      /Neo4j/,
    );
    expect(firstBullet, "the first reason does not name PostgreSQL").toMatch(
      /PostgreSQL/,
    );

    // NeoDash stays — the migration path is real and the importer ships — but
    // as a supporting line, and described as unmaintained rather than
    // "deprecated": the Labs build is Apache-2.0 and abandoned, while the
    // supported NeoDash is sold inside a Neo4j Enterprise agreement.
    expect(text, "the README still calls NeoDash deprecated").not.toMatch(
      /deprecated NeoDash/i,
    );
  });

  it("links the docs as in-repo pages while the Pages site is off", () => {
    // docs-pages.yml deploys only when the DOCS_DEPLOY variable is on, which
    // waits for the org transfer (#1214), so every github.io link 404s. The
    // .mdx sources render on GitHub today. Switch to the site URL, and flip
    // this test, in the PR that turns Pages on.
    expect(readDoc(".github/workflows/docs-pages.yml")).toContain(
      "vars.DOCS_DEPLOY == 'true'",
    );
    expect(readme()).not.toContain("github.io");
    for (const page of [
      "start-here/troubleshooting",
      "deploy/production",
      "start-here/migration-from-neodash",
    ])
      expect(readme()).toContain(`(docs/src/content/docs/${page}.mdx)`);
  });

  it("installs from a clone with the script the repo ships", () => {
    const { owner, repo } = ownerRepo();
    const block = fence("bash install.sh");
    expect(block).toContain(
      `git clone https://github.com/${owner}/${repo}.git`,
    );
    expect(block).toMatch(new RegExp(`^cd ${repo}(?:\\s|$)`, "m"));
    expect(existsSync(resolve(REPO_ROOT, "install.sh"))).toBe(true);
  });

  it("says the CLI is not on npm yet, and runs nothing from npm", () => {
    expect(readme()).toContain("not on npm yet");
    expect(
      (readme().match(/```bash\n[\s\S]*?```/g) ?? []).filter((b) =>
        /npx @neoboard\/cli|npm (?:i|install) (?:-g |--global )?@neoboard\/cli/.test(
          b,
        ),
      ),
    ).toEqual([]);
  });

  it("shows the hero the walkthrough writes, light and dark (#1861)", () => {
    // app/e2e/showcase.walkthrough.ts rewrites the pair; a rename there would
    // leave the README pointing at a stale or deleted image.
    const walkthrough = readDoc("app/e2e/showcase.walkthrough.ts");
    // readmeShots must name its files through README_HERO, or the map below
    // proves nothing about what the run writes.
    expect(walkthrough).toContain("README_HERO[colorScheme]");
    const written = Object.fromEntries(
      [...walkthrough.matchAll(/^\s+(light|dark): "([\w-]+\.png)",$/gm)].map(
        (m) => [m[1], `screenshots/${m[2]}`],
      ),
    );
    const picture = /<picture>[\s\S]*?<\/picture>/.exec(readme())?.[0] ?? "";
    const shown = {
      dark: /<source media="\(prefers-color-scheme: dark\)" srcset="([^"]+)"/.exec(
        picture,
      )?.[1],
      light: /<img src="([^"]+)"/.exec(picture)?.[1],
    };
    // toEqual skips undefined keys: without this, a README with no <picture>
    // and a walkthrough with no parseable map would compare {} to {} and pass.
    expect(Object.keys(written).sort()).toEqual(["dark", "light"]);
    expect(shown).toEqual(written);
    for (const file of Object.values(written))
      expect(existsSync(resolve(REPO_ROOT, file)), file).toBe(true);
  });

  it("points badges and relative links at things that exist", () => {
    const { owner, repo } = ownerRepo();
    const md = readme();

    const repos = [
      ...md.matchAll(
        /(?:github\.com|img\.shields\.io\/github\/[\w-]+)\/([\w-]+)\/([\w-]+)/g,
      ),
    ].map((m) => `${m[1]}/${m[2]}`);
    expect(repos.length).toBeGreaterThan(0);
    expect(repos.filter((r) => r !== `${owner}/${repo}`)).toEqual([]);

    const workflows = [
      ...md.matchAll(/actions\/workflows\/([\w.-]+\.ya?ml)/g),
    ].map((m) => m[1]);
    expect(workflows.length).toBeGreaterThan(0);
    expect(
      workflows.filter(
        (w) => !existsSync(resolve(REPO_ROOT, ".github/workflows", w)),
      ),
    ).toEqual([]);

    const key = /^sonar\.projectKey=(.+)$/m.exec(
      readDoc("sonar-project.properties"),
    )?.[1];
    const sonar = [
      ...md.matchAll(/sonarcloud\.io\/[^"]*?[?&](?:id|project)=([\w-]+)/g),
    ].map((m) => m[1]);
    expect(sonar.length).toBeGreaterThan(0);
    expect(sonar.filter((k) => k !== key)).toEqual([]);

    const relative = [
      ...md.matchAll(
        /(?:href|src)="(?!https?:|#)([^"]+)"|\]\((?!https?:|#|<)([^)\s]+)\)/g,
      ),
    ].map((m) => (m[1] ?? m[2]).split("#")[0]);
    expect(relative.length).toBeGreaterThan(0);
    expect(relative.filter((p) => !existsSync(resolve(REPO_ROOT, p)))).toEqual(
      [],
    );
  });
});
