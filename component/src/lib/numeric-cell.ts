/**
 * What counts as a number in a result cell, and what may be done with one
 * (#1925).
 *
 * A connector returns a number as a `number` when a double holds it exactly,
 * and as a decimal **string** when it does not — #1304 and #1307 chose
 * precision over type consistency, and #1622 shipped from string coordinates.
 * So every layer that asks "is this a number?" has to accept both, and this
 * module is the one place that answers.
 *
 * The precision rule, stated once:
 *
 * - **Drawing** may coerce to a double. A chart is pixels; the loss is real
 *   and accepted, and `toChartNumber` is where it happens.
 * - **Sorting, equality and display must not.** A column of ids past 2^53
 *   sorts wrongly and displays wrongly the moment it goes through a double,
 *   and neither failure looks like an error. `compareNumericCells` and
 *   `formatNumericCell` work on the digits.
 *
 * `compact` and `percent` formats are the exception: both round by intent, so
 * both go through a double and say so at the call site.
 */

/** A number in full: optional sign, digits, optional fraction, optional exponent. */
const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * A number, or a string that is entirely one. Not a date, not "12kg", not
 * blank. Narrows, so a caller can go straight to the digits afterwards.
 */
export function isNumericCell(v: unknown): v is number | string {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v !== "string") return false;
  const s = v.trim();
  return s !== "" && NUMERIC.test(s);
}

/** A double, for drawing. `null` when the cell is not a number at all. */
export function toChartNumber(v: unknown): number | null {
  if (!isNumericCell(v)) return null;
  return typeof v === "number" ? v : Number(v.trim());
}

/**
 * Zero-trimming and grouping are done by hand rather than with `/0+$/`,
 * `/^0+(?=\d)/` and the usual `/\B(?=(\d{3})+(?!\d))/g`: all three backtrack
 * super-linearly, and a digit string here has no bound a caller can rely on.
 */
function trimTrailingZeros(s: string): string {
  let end = s.length;
  while (end > 0 && s.codePointAt(end - 1) === 48) end--;
  return s.slice(0, end);
}

function trimLeadingZeros(s: string): string {
  let i = 0;
  while (i < s.length - 1 && s.codePointAt(i) === 48) i++;
  return s.slice(i);
}

interface Parts {
  negative: boolean;
  int: string;
  frac: string;
}

/** Digits only, sign separated, exponent expanded, leading zeros stripped. */
function parts(v: number | string): Parts {
  let s = String(v).trim();
  if (/[eE]/.test(s)) {
    // An exponent cannot be compared digit by digit, and a value written with
    // one is already inside double range in every case this sees.
    const expanded = trimTrailingZeros(Number(s).toFixed(20));
    s = expanded.endsWith(".") ? expanded.slice(0, -1) : expanded;
  }
  const negative = s.startsWith("-");
  if (negative || s.startsWith("+")) s = s.slice(1);
  const [int = "", frac = ""] = s.split(".");
  return {
    negative,
    int: trimLeadingZeros(int) || "0",
    frac: trimTrailingZeros(frac),
  };
}

function compareMagnitude(a: Parts, b: Parts): number {
  if (a.int.length !== b.int.length) return a.int.length - b.int.length;
  if (a.int !== b.int) return a.int < b.int ? -1 : 1;
  const width = Math.max(a.frac.length, b.frac.length);
  const af = a.frac.padEnd(width, "0");
  const bf = b.frac.padEnd(width, "0");
  if (af === bf) return 0;
  return af < bf ? -1 : 1;
}

/**
 * Order two numeric cells by their digits, so two ids past 2^53 that a double
 * cannot tell apart still sort. Non-numeric cells sort last, stably.
 */
export function compareNumericCells(a: unknown, b: unknown): number {
  const aNum = isNumericCell(a);
  const bNum = isNumericCell(b);
  if (!aNum || !bNum) return Number(bNum) - Number(aNum);

  const pa = parts(a as number | string);
  const pb = parts(b as number | string);
  const aZero = pa.int === "0" && pa.frac === "";
  const bZero = pb.int === "0" && pb.frac === "";
  if (aZero && bZero) return 0; // -0 is 0
  if (pa.negative !== pb.negative) return pa.negative ? -1 : 1;
  const magnitude = compareMagnitude(pa, pb);
  return pa.negative ? -magnitude : magnitude;
}

/** Round a digit string half-up, carrying an overflow into the integer part. */
function round(p: Parts, places: number): Parts {
  if (p.frac.length <= places) {
    return { ...p, frac: p.frac.padEnd(places, "0") };
  }
  const keep = p.frac.slice(0, places);
  const roundUp = (p.frac.codePointAt(places) ?? 0) >= 53; // '5'
  if (!roundUp) return { ...p, frac: keep };

  const digits = (p.int + keep).split("");
  let i = digits.length - 1;
  for (; i >= 0; i--) {
    if (digits[i] === "9") {
      digits[i] = "0";
    } else {
      digits[i] = String(Number(digits[i]) + 1);
      break;
    }
  }
  if (i < 0) digits.unshift("1");
  const carried = digits.join("");
  const cut = carried.length - places;
  return {
    ...p,
    int: carried.slice(0, cut) || "0",
    frac: carried.slice(cut),
  };
}

function group(int: string): string {
  let out = "";
  for (let i = int.length; i > 0; i -= 3) {
    const chunk = int.slice(Math.max(0, i - 3), i);
    out = out ? `${chunk},${out}` : chunk;
  }
  return out;
}

export interface NumericCellFormat {
  numberFormat?: "plain" | "comma" | "compact" | "percent";
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
}

/**
 * Format a numeric cell without going through a double, so every digit
 * survives. Only `plain` and `comma` are exact — `compact` and `percent` round
 * by intent and are left to the caller's `Intl` path.
 */
export function formatNumericCell(
  value: unknown,
  config: NumericCellFormat,
): string {
  if (!isNumericCell(value)) return String(value);
  const { decimalPlaces, prefix = "", suffix = "" } = config;
  let p = parts(value as number | string);
  if (decimalPlaces !== undefined) p = round(p, decimalPlaces);
  const int = config.numberFormat === "comma" ? group(p.int) : p.int;
  const sign = p.negative && !(p.int === "0" && p.frac === "") ? "-" : "";
  const body = p.frac ? `${int}.${p.frac}` : int;
  return `${prefix}${sign}${body}${suffix}`;
}
