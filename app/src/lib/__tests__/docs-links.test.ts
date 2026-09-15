import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_LINKS } from "../docs-links";

// The app's help links go to the GitHub Pages project site, the only place
// the docs publish (#1213). Each one must be a page the site builds, not a
// redirect or a guess.
const SITE = "https://alfredo1996.github.io/neoboard/";
const CONTENT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/src/content/docs",
);

describe("DOCS_LINKS", () => {
  it.each(Object.entries(DOCS_LINKS))(
    "%s is a page on the docs site",
    (_, url) => {
      expect(url.startsWith(SITE)).toBe(true);
      expect(url.endsWith("/")).toBe(true);
      const route = url.slice(SITE.length, -1);
      expect(existsSync(`${CONTENT}/${route}.mdx`), route).toBe(true);
    },
  );
});
