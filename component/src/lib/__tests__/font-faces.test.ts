import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Every face is self-hosted (#1683, air-gapped installs) and only the three
 * redesign families are declared (#2215).
 */
const root = resolve(__dirname, "../../..");
const css = readFileSync(resolve(root, "design-tokens.css"), "utf8");
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
const srcOf = (face: string) => face.match(/url\(["']?([^"')]+)["']?\)/)?.[1];

describe("@font-face declarations (#2215)", () => {
  it("declares exactly Source Serif 4, IBM Plex Sans and IBM Plex Mono", () => {
    const families = new Set(
      faces.map((f) => f.match(/font-family:\s*"([^"]+)"/)?.[1]),
    );
    expect(families).toEqual(
      new Set(["Source Serif 4", "IBM Plex Sans", "IBM Plex Mono"]),
    );
  });

  it("gives all eight faces a unicode-range, so latin-ext loads only when needed", () => {
    expect(faces).toHaveLength(8);
    for (const f of faces) expect(f).toMatch(/unicode-range:\s*U\+/);
  });

  it.each(faces.map((f) => [srcOf(f)] as const))(
    "%s is a relative local file that exists, not a URL",
    (src) => {
      expect(src).toMatch(/^\.\/fonts\/[\w-]+\.woff2$/);
      expect(existsSync(resolve(root, src!))).toBe(true);
    },
  );
});
