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

/**
 * A double, for drawing. `null` when the cell is not a number at all — and
 * also when it is one a double cannot hold: `Number("1e309")` is `Infinity`,
 * and a chart handed that draws nothing useful while reporting no error.
 */
export function toChartNumber(v: unknown): number | null {
  if (!isNumericCell(v)) return null;
  const n = typeof v === "number" ? v : Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * A number as sign, digits and a decimal exponent: the value is
 * `0.<digits> x 10^exp`, with no leading or trailing zeros in `digits`. Zero
 * is `digits === ""`.
 *
 * Comparison works on this form directly and never expands, so an exponent of
 * any size orders exactly — `9e5000` below `1e5001` — in time proportional to
 * the digits written, not to the value. Only formatting has to expand, and
 * only formatting has a limit.
 */
interface Decimal {
  negative: boolean;
  digits: string;
  exp: number;
}

function trimTrailingZeros(s: string): string {
  let end = s.length;
  while (end > 0 && s.codePointAt(end - 1) === 48) end--;
  return s.slice(0, end);
}

function normalize(v: number | string): Decimal {
  let s = String(v).trim();
  let exponent = 0;
  const e = s.search(/[eE]/);
  if (e !== -1) {
    exponent = Number(s.slice(e + 1));
    s = s.slice(0, e);
  }
  const negative = s.startsWith("-");
  if (negative || s.startsWith("+")) s = s.slice(1);

  const [int = "", frac = ""] = s.split(".");
  const all = int + frac;
  let lead = 0;
  while (lead < all.length && all.codePointAt(lead) === 48) lead++;
  const digits = trimTrailingZeros(all.slice(lead));
  // `int.length - lead` is where the point sits once leading zeros are gone.
  return {
    negative,
    digits,
    exp: digits === "" ? 0 : int.length - lead + exponent,
  };
}

function compareMagnitude(a: Decimal, b: Decimal): number {
  if (a.exp !== b.exp) return a.exp < b.exp ? -1 : 1;
  const width = Math.max(a.digits.length, b.digits.length);
  const ad = a.digits.padEnd(width, "0");
  const bd = b.digits.padEnd(width, "0");
  if (ad === bd) return 0;
  return ad < bd ? -1 : 1;
}

/**
 * Order two numeric cells by their digits, so two ids past 2^53 that a double
 * cannot tell apart still sort. Non-numeric cells sort last, stably.
 */
export function compareNumericCells(a: unknown, b: unknown): number {
  const aNum = isNumericCell(a);
  const bNum = isNumericCell(b);
  if (!aNum || !bNum) return Number(bNum) - Number(aNum);

  const da = normalize(a);
  const db = normalize(b);
  if (da.digits === "" && db.digits === "") return 0; // -0 is 0
  if (da.digits === "") return db.negative ? 1 : -1;
  if (db.digits === "") return da.negative ? -1 : 1;
  if (da.negative !== db.negative) return da.negative ? -1 : 1;
  const magnitude = compareMagnitude(da, db);
  return da.negative ? -magnitude : magnitude;
}

/**
 * ponytail: expansion is capped at MAX_EXPANDED_DIGITS. A cell is data from a
 * database, and `"1e999999999"` would otherwise allocate a gigabyte of zeros
 * to render. Past the cap the value is shown in scientific form instead — a
 * defined answer, unlike the raw input, which the digit operations below would
 * read as digits. Raise the cap if a real result set ever needs it.
 */
const MAX_EXPANDED_DIGITS = 4096;

/** `<digits>` and `<exp>` laid out as an ordinary decimal, or null past the cap. */
function expand(d: Decimal): { int: string; frac: string } | null {
  if (Math.abs(d.exp) > MAX_EXPANDED_DIGITS) return null;
  if (d.digits === "") return { int: "0", frac: "" };
  if (d.exp <= 0) return { int: "0", frac: "0".repeat(-d.exp) + d.digits };
  if (d.exp >= d.digits.length)
    return { int: d.digits + "0".repeat(d.exp - d.digits.length), frac: "" };
  return { int: d.digits.slice(0, d.exp), frac: d.digits.slice(d.exp) };
}

function scientific(d: Decimal): string {
  const [first, ...rest] = d.digits;
  const mantissa = rest.length ? `${first}.${rest.join("")}` : first;
  return `${d.negative ? "-" : ""}${mantissa}e${d.exp - 1}`;
}

/** Round a digit string half-up, carrying an overflow into the integer part. */
function round(
  parts: { int: string; frac: string },
  places: number,
): { int: string; frac: string } {
  if (parts.frac.length <= places) {
    return { ...parts, frac: parts.frac.padEnd(places, "0") };
  }
  const keep = parts.frac.slice(0, places);
  const roundUp = (parts.frac.codePointAt(places) ?? 0) >= 53; // '5'
  if (!roundUp) return { ...parts, frac: keep };

  const digits = (parts.int + keep).split("");
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
  return { int: carried.slice(0, cut) || "0", frac: carried.slice(cut) };
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
  const d = normalize(value);

  let p = expand(d);
  if (p === null) return `${prefix}${scientific(d)}${suffix}`;
  if (decimalPlaces !== undefined) p = round(p, decimalPlaces);

  const int = config.numberFormat === "comma" ? group(p.int) : p.int;
  const zero = p.int === "0" && trimTrailingZeros(p.frac) === "";
  const sign = d.negative && !zero ? "-" : "";
  const body = p.frac ? `${int}.${p.frac}` : int;
  return `${prefix}${sign}${body}${suffix}`;
}
