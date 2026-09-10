import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// #1319 — the docs site wears the product's brand, not Starlight's indigo.
//
// Starlight themes with `:root` (dark) and `:root[data-theme="light"]`, not the
// app's `.dark` class, so component/design-tokens.css cannot be imported as-is:
// docs/src/styles/brand.css carries copies of the tokens it needs. These checks
// hold every copy to its token, so a palette change in the app cannot leave the
// docs behind.
//
// node:test, not vitest, so the Docs workflow can run it with no install.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Declarations of the first rule whose selector is exactly `selector`. */
function declarations(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = stripComments(css).match(
    new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m"),
  );
  assert.ok(m, `no \`${selector} { … }\` rule`);
  const out = new Map();
  for (const d of m[1].split(";")) {
    const i = d.indexOf(":");
    if (i > 0) out.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
  }
  return out;
}

const TOKENS = read("component/design-tokens.css");
const BRAND_PATH = "docs/src/styles/brand.css";
const BRAND = existsSync(join(ROOT, BRAND_PATH)) ? read(BRAND_PATH) : "";

const token = {
  light: declarations(TOKENS, ":root"),
  dark: declarations(TOKENS, ".dark"),
};
const brand = () => ({
  dark: declarations(BRAND, ":root"),
  light: declarations(BRAND, ':root[data-theme="light"]'),
});
const hsl = (theme, name) => `hsl(${token[theme].get(name)})`;
const hue = (value) => value.match(/hsl\((\d+)/)?.[1];

/** `H S% L%` → `#rrggbb`, the form an SVG fill attribute takes everywhere. */
function hex(channels) {
  const [h, s, l] = channels.match(/[\d.]+/g).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

describe("docs brand (#1319)", () => {
  const config = read("docs/astro.config.mjs");

  it("Starlight loads the brand stylesheet", () => {
    const css = config.match(/customCss:\s*\[([^\]]*)\]/);
    assert.ok(css, "astro.config.mjs sets no customCss");
    assert.match(css[1], /["']\.\/src\/styles\/brand\.css["']/);
    assert.ok(existsSync(join(ROOT, BRAND_PATH)), `${BRAND_PATH} is missing`);
  });

  it("maps Starlight's accent onto the app's interaction tokens in both themes", () => {
    const b = brand();
    for (const theme of ["light", "dark"]) {
      const d = b[theme];
      assert.equal(d.get("--sl-color-accent"), hsl(theme, "--ring"), theme);
      assert.equal(
        d.get("--sl-color-accent-low"),
        hsl(theme, "--accent"),
        theme,
      );
      // No token for the strong end; it has to stay in the ring's family.
      const high = d.get("--sl-color-accent-high");
      assert.ok(high, `${theme}: --sl-color-accent-high not set`);
      assert.equal(
        hue(high),
        hue(hsl(theme, "--ring")),
        `${theme}: accent-high hue`,
      );
    }
  });

  it("puts the page on the app's graphite ground and ink in both themes", () => {
    const b = brand();
    for (const theme of ["light", "dark"]) {
      // Starlight's names are inverted in light mode: "black" is the page.
      assert.equal(
        b[theme].get("--sl-color-black"),
        hsl(theme, "--background"),
        theme,
      );
      assert.equal(
        b[theme].get("--sl-color-white"),
        hsl(theme, "--foreground"),
        theme,
      );
    }
  });

  it("declares the same colours in both theme blocks", () => {
    // brand.css is unlayered, so a colour set only in `:root` beats Starlight's
    // layered light theme and leaks the dark value into light mode.
    const b = brand();
    const colours = (d) =>
      [...d.keys()].filter((k) => k.startsWith("--sl-color-")).sort();
    assert.deepEqual(colours(b.light), colours(b.dark));
  });

  it("self-hosts Geist Sans from the component package, with no remote font", () => {
    assert.doesNotMatch(BRAND, /url\(\s*["']?(https?:)?\/\//, "remote url()");
    assert.doesNotMatch(BRAND, /@import/, "@import pulls in a stylesheet");
    const face = stripComments(BRAND).match(/@font-face\s*\{([^}]*)\}/);
    assert.ok(face, "no @font-face");
    assert.match(face[1], /font-family:\s*"Geist Sans"/);
    const src = face[1].match(/url\(["']?([^"')]+)["']?\)/)[1];
    const file = resolve(ROOT, dirname(BRAND_PATH), src);
    assert.equal(file, join(ROOT, "component/fonts/geist-sans-variable.woff2"));
    assert.ok(existsSync(file), `${src} does not resolve`);
    assert.match(brand().dark.get("--sl-font") ?? "", /^"Geist Sans"/);
  });

  it("uses the wordmark's citrine mark as logo and favicon", () => {
    const logo = config.match(/logo:\s*\{[^}]*src:\s*["']([^"']+)["']/);
    assert.ok(logo, "astro.config.mjs sets no logo");
    // Starlight's default favicon is /favicon.svg; a custom one would need a
    // `favicon` key, which this check would then have to follow.
    assert.doesNotMatch(config, /favicon:/);
    const citrine = hex(token.light.get("--brand"));
    for (const file of [join("docs", logo[1]), "docs/public/favicon.svg"]) {
      assert.ok(existsSync(join(ROOT, file)), `${file} is missing`);
      assert.match(read(file), new RegExp(`fill="${citrine}"`, "i"), file);
    }
  });

  it("gives the landing hero one primary action and a quieter second", () => {
    const hero = read("docs/src/content/docs/index.mdx").split(/^---$/m)[1];
    const actions = hero.match(/^\s+- text:/gm) ?? [];
    const variants = hero.match(/^\s+variant: (\w+)$/gm) ?? [];
    // Starlight's default variant is primary, so an action without one is too.
    assert.equal(
      variants.length,
      actions.length,
      "every action names a variant",
    );
    assert.equal(variants.filter((v) => v.endsWith("primary")).length, 1);
  });

  it("runs in the Docs workflow, which also checks the build kept the brand", () => {
    // ci.yml ignores docs/**, so a docs-only PR would otherwise skip this file.
    const workflow = read(".github/workflows/docs-ci.yml");
    assert.match(
      workflow,
      /^\s+run: node --test scripts\/__tests__\/docs-brand\.node-test\.mjs$/m,
    );
    assert.match(workflow, /Fail if the build lost the brand/);
    assert.match(workflow, /^\s+DOCS_BUILT: ["']1["']$/m);
  });
});

// Starlight's own indigo is always in the bundle (its base layer), so "no
// default colours in the build" can never pass. What a Starlight upgrade can
// silently do is stop reading a variable brand.css sets — the override would
// then do nothing. These need `npm ci --prefix docs` and a build, so they run
// in the Docs workflow after it builds, not in `npm run verify`.
describe(
  "docs brand in the built site (#1319)",
  {
    skip:
      process.env.DOCS_BUILT !== "1" && "set DOCS_BUILT=1 after building docs",
  },
  () => {
    const DIST = join(ROOT, "docs/dist");
    const STARLIGHT = join(ROOT, "docs/node_modules/@astrojs/starlight");

    it("sets only variables this Starlight still reads", () => {
      const sources = [];
      const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, e.name);
          if (e.isDirectory() && e.name !== "node_modules") walk(full);
          else if (/\.(css|astro)$/.test(e.name))
            sources.push(readFileSync(full, "utf8"));
        }
      };
      walk(STARLIGHT);
      const starlight = sources.join("\n");
      const names = new Set(BRAND.match(/--sl-[\w-]+(?=\s*:)/g));
      assert.ok(names.size > 0);
      for (const name of names)
        assert.match(starlight, new RegExp(`var\\(\\s*${name}\\s*[,)]`), name);
    });

    it("ships the self-hosted font, the favicon, the logo and both hero variants", () => {
      const assets = readdirSync(join(DIST, "_astro"));
      assert.ok(assets.some((f) => /^geist-sans-variable\..+\.woff2$/.test(f)));
      const css = assets
        .filter((f) => f.endsWith(".css"))
        .map((f) => readFileSync(join(DIST, "_astro", f), "utf8"))
        .join("\n");
      assert.match(css, /Geist Sans/);
      assert.ok(existsSync(join(DIST, "favicon.svg")));
      const html = readFileSync(join(DIST, "index.html"), "utf8");
      assert.match(
        html,
        /<link rel="shortcut icon" href="[^"]*\/favicon\.svg"/,
      );
      assert.match(
        html,
        /class="site-title[^"]*"><img[^>]*src="[^"]*\/mark\.[^"]*\.svg"/,
      );
      assert.match(html, /class="sl-link-button[^"]* primary /);
      assert.match(html, /class="sl-link-button[^"]* secondary /);
    });
  },
);
