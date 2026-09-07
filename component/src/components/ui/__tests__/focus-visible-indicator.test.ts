import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * #1552 — the light-mode menu/select/command highlight was invisible.
 *
 * Two independent failures compounded:
 *
 * 1. The fill barely changed. `--accent: 38 100% 96%` (#fff8eb, the citrine
 *    value before #1553; the azure that replaced it is no better at 1.17) against
 *    `--popover: 0 0% 100%` measures 1.06:1. WCAG 1.4.11 asks 3:1 for a
 *    non-text UI indicator.
 * 2. The paired text-colour change was a no-op. `--accent-foreground` is
 *    byte-identical to `--popover-foreground` (both `220 13% 9%`), so
 *    `focus:text-accent-foreground` changed nothing.
 *
 * And the consumers set `outline-none`, removing the browser's own indicator,
 * then relied solely on that fill. Keyboard users had no way to see where they
 * were. WCAG 2.4.7 Focus Visible.
 *
 * The fix has to be independent of the fill token, because the fill's hue is
 * an open question (#1553 proposes retargeting it). A ring drawn from `--ring`
 * satisfies 1.4.11 on its own — see the contrast test below — and survives any
 * palette decision.
 *
 * This is a source ratchet rather than a render test on one component
 * deliberately: the defect was a *class* of omission across six files, and a
 * jsdom render can only assert class strings anyway (no Tailwind is compiled),
 * so asserting the invariant across every file that has the risky shape is
 * strictly more useful than asserting it once.
 */

const uiDir = resolve(__dirname, "..");

/** Utilities that draw a focus indicator not made of background fill. */
const INDICATOR = /focus:(ring|outline)|focus-visible:(ring|outline)/;

/**
 * Per-OCCURRENCE, not per-file. select.tsx would pass a file-level check
 * because its trigger carries `focus-visible:ring-2` (line 32) while
 * SelectItem, the element the user actually navigates, has only the fill
 * (line 133). File granularity hid exactly the case this is meant to catch.
 *
 * The unit is the CLASS STRING, not the source line. It was the line until
 * #1632: every risky class string happened to be one long single-quoted line,
 * so the two utilities were always seen together — but splitting one across
 * two literals, which is what anyone editing a 300-character line does and
 * what prettier does the moment the line grows, made the ratchet go quietly
 * blind. Quoted segments are joined per statement so the check survives
 * however the source is wrapped.
 */

/**
 * The class strings in one source file, each with the line it starts on.
 *
 * A "class string" here is a run of adjacent string/template literals — the
 * shape `cn("a b", "c d")` and a wrapped `"a b " + "c d"` both produce one
 * entry — so a utility split across two literals is still seen alongside its
 * neighbours.
 */
export function classStrings(src: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const lines = src.split("\n");
  let buf: string[] = [];
  let start = 0;

  const flush = () => {
    if (buf.length) out.push({ text: buf.join(" "), line: start + 1 });
    buf = [];
  };

  lines.forEach((line, i) => {
    const quoted = line.match(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g);
    if (!quoted) {
      // A line with no literal ends the run — different statement, different
      // class string.
      if (!/^\s*[,)]/.test(line) && !/^\s*$/.test(line)) flush();
      return;
    }
    if (!buf.length) start = i;
    buf.push(quoted.map((q) => q.slice(1, -1)).join(" "));
  });
  flush();
  return out;
}

/** Class strings that kill the native outline and signal focus with fill alone. */
export function occurrencesRelyingOnFillAlone(
  read: (file: string) => string = (f) =>
    readFileSync(resolve(uiDir, f), "utf8"),
  files: string[] = readdirSync(uiDir).filter((f) => f.endsWith(".tsx")),
): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    for (const { text, line } of classStrings(read(file))) {
      // The risky shape: kill the native outline, then signal focus with only
      // a background colour.
      if (!text.includes("outline-none")) continue;
      if (!text.includes("focus:bg-accent")) continue;
      if (!INDICATOR.test(text)) offenders.push(`${file}:${line}`);
    }
  }
  return offenders;
}

/** How many class strings carry the risky shape at all. */
export function riskyOccurrenceCount(): number {
  let n = 0;
  for (const file of readdirSync(uiDir).filter((f) => f.endsWith(".tsx"))) {
    for (const { text } of classStrings(
      readFileSync(resolve(uiDir, file), "utf8"),
    )) {
      if (text.includes("outline-none") && text.includes("focus:bg-accent"))
        n++;
    }
  }
  return n;
}

describe("#1552 — focus must not be signalled by fill alone", () => {
  it("finds occurrences of the risky shape at all", () => {
    // Counts MATCHES, not files. It counted files until #1632, so a detector
    // that had stopped matching anything still satisfied its own guard.
    expect(riskyOccurrenceCount()).toBeGreaterThan(5);
  });

  it("still sees a class string split across two literals", () => {
    // The reason the file-count guard was not enough: the detector required
    // both utilities on one physical line, and reformatting separated them.
    const split = `
      const cls = cn(
        "outline-none focus:bg-accent",
        "text-sm",
      );
    `;
    expect(occurrencesRelyingOnFillAlone(() => split, ["fixture.tsx"])).toEqual(
      ["fixture.tsx:3"],
    );
  });

  it("accepts a split class string that does carry a ring", () => {
    const ok = `
      const cls = cn(
        "outline-none focus:bg-accent",
        "focus-visible:ring-2 focus-visible:ring-ring",
      );
    `;
    expect(occurrencesRelyingOnFillAlone(() => ok, ["fixture.tsx"])).toEqual(
      [],
    );
  });

  it("gives every such component a real focus indicator", () => {
    expect(
      occurrencesRelyingOnFillAlone(),
      "these remove the native outline and signal focus only with a background fill",
    ).toEqual([]);
  });
});

/**
 * Supporting invariant, not a Red gate: it already held. It documents WHY a
 * ring is a valid indicator here, so a future palette change that quietly
 * broke it would fail loudly.
 */
describe("#1552 — the ring token clears WCAG 1.4.11 on a popover", () => {
  const css = readFileSync(
    resolve(__dirname, "../../../../design-tokens.css"),
    "utf8",
  );

  function block(selector: string): string {
    const start = css.indexOf(selector);
    const open = css.indexOf("{", start);
    return css.slice(open + 1, css.indexOf("}", open));
  }

  function token(blockCss: string, name: string): string {
    const m = blockCss.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!m) throw new Error(`missing token ${name}`);
    return m[1].trim();
  }

  /** "H S% L%" -> sRGB channels in 0..1. */
  function hslToRgb(value: string): [number, number, number] {
    const [h, s, l] = value
      .split(/\s+/)
      .map((p) => parseFloat(p.replace("%", "")));
    const sN = s / 100;
    const lN = l / 100;
    const c = (1 - Math.abs(2 * lN - 1)) * sN;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lN - c / 2;
    const seg = Math.floor(h / 60) % 6;
    const table: [number, number, number][] = [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ];
    const [r, g, b] = table[seg];
    return [r + m, g + m, b + m];
  }

  function luminance(value: string): number {
    const lin = (v: number) =>
      v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    const [r, g, b] = hslToRgb(value).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  it.each([":root", ".dark"])("ring vs popover in %s", (selector) => {
    const b = block(selector);
    expect(
      contrast(token(b, "--ring"), token(b, "--popover")),
    ).toBeGreaterThanOrEqual(3);
  });

  // NOTE: an earlier draft of this file asserted `contrast(--accent,
  // --popover) < 3` and `--accent-foreground === --popover-foreground` — the
  // two measurements that made the ring necessary. Both were removed: they
  // pin the DEFECT as a requirement, so anyone improving the fill (#1553
  // proposes exactly that) would have had to delete a green test to do it.
  // The measurements live in this file's header, where they explain without
  // constraining. What is enforced is the ring, which is the actual fix.
});
