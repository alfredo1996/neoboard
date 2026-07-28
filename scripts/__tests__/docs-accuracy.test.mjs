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
  it("maps host.docker.internal", () => {
    expect(
      readFileSync(join(ROOT, "docker/docker-compose.expose-host.yml"), "utf8"),
    ).toContain("host.docker.internal:host-gateway");
  });

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
