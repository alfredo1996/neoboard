import { describe, it, expect } from "vitest";
import {
  isNumericCell,
  toChartNumber,
  compareNumericCells,
  formatNumericCell,
} from "../numeric-cell";

/** Past 2^53 (9007199254740992): a double rounds both of these to the same value. */
const COLLIDES_A = "9007199254740992";
const COLLIDES_B = "9007199254740993";
/** A value a double cannot represent at all. */
const BIG_A = "9007199254740993";

describe("isNumericCell", () => {
  it.each([
    ["a number", 12, true],
    ["a negative number", -12, true],
    ["zero", 0, true],
    ["a plain numeric string", "12", true],
    ["a decimal string", "48210.50", true],
    ["a negative decimal string", "-48210.50", true],
    ["a leading-plus string", "+7", true],
    ["a fraction with no integer part", ".5", true],
    ["an exponent string", "1.2e10", true],
    ["a padded numeric string", "  12  ", true],
    ["a value past 2^53 as a string", BIG_A, true],
    ["a word", "n/a", false],
    ["a trailing-unit string", "12kg", false],
    ["an empty string", "", false],
    ["whitespace", "   ", false],
    ["an ISO date", "2026-09-01", false],
    ["an ISO duration", "P1M2DT3S", false],
    ["NaN", NaN, false],
    ["Infinity", Infinity, false],
    ["a boolean", true, false],
    ["null", null, false],
    ["undefined", undefined, false],
    ["an object", {}, false],
  ])("%s -> %s", (_label, v, expected) => {
    expect(isNumericCell(v)).toBe(expected);
  });
});

describe("toChartNumber", () => {
  it("coerces for drawing, which may lose precision on purpose", () => {
    expect(toChartNumber("48210.50")).toBe(48210.5);
    expect(toChartNumber(12)).toBe(12);
    // A chart draws in doubles; that is the one place the loss is accepted.
    expect(toChartNumber(BIG_A)).toBe(9007199254740992);
  });

  it("is null for anything that is not a numeric cell", () => {
    for (const v of ["n/a", "", "   ", null, undefined, {}, NaN])
      expect(toChartNumber(v)).toBeNull();
  });
});

describe("compareNumericCells — exact past 2^53", () => {
  it("orders two values a double cannot tell apart", () => {
    expect(Number(COLLIDES_A)).toBe(Number(COLLIDES_B)); // the trap
    expect(compareNumericCells(COLLIDES_A, COLLIDES_B)).toBeLessThan(0);
    expect(compareNumericCells(COLLIDES_B, COLLIDES_A)).toBeGreaterThan(0);
    expect(compareNumericCells(COLLIDES_A, COLLIDES_A)).toBe(0);
  });

  it.each([
    ["9", "10", -1],
    ["10", "9", 1],
    ["-10", "-9", -1],
    ["-1", "1", -1],
    ["0", "-0", 0],
    ["1.5", "1.25", 1],
    ["1.25", "1.5", -1],
    ["1.50", "1.5", 0],
    ["0.1", ".1", 0],
    ["+7", "7", 0],
    ["2", "10", -1],
  ])("%s vs %s", (a, b, sign) => {
    expect(Math.sign(compareNumericCells(a, b))).toBe(sign);
  });

  it("mixes numbers and numeric strings", () => {
    expect(Math.sign(compareNumericCells(9, "10"))).toBe(-1);
    expect(Math.sign(compareNumericCells("9", 10))).toBe(-1);
  });
});

describe("formatNumericCell — a string is formatted, not passed through", () => {
  it("groups a numeric string without going through a double", () => {
    expect(formatNumericCell(BIG_A, { numberFormat: "comma" })).toBe(
      "9,007,199,254,740,993",
    );
    expect(formatNumericCell("48210.50", { numberFormat: "comma" })).toBe(
      "48,210.5",
    );
  });

  it("keeps every digit in plain form", () => {
    expect(formatNumericCell(BIG_A, { numberFormat: "plain" })).toBe(BIG_A);
  });

  it("applies decimalPlaces to a string exactly", () => {
    expect(
      formatNumericCell("48210.567", {
        numberFormat: "plain",
        decimalPlaces: 2,
      }),
    ).toBe("48210.57");
    expect(
      formatNumericCell("1.005", { numberFormat: "plain", decimalPlaces: 2 }),
    ).toBe("1.01"); // a double rounds this to 1.00
    expect(
      formatNumericCell("2", { numberFormat: "plain", decimalPlaces: 2 }),
    ).toBe("2.00");
  });

  it("carries a rounding overflow into the integer part", () => {
    expect(
      formatNumericCell("9.99", { numberFormat: "plain", decimalPlaces: 1 }),
    ).toBe("10.0");
    expect(
      formatNumericCell("-9.99", { numberFormat: "plain", decimalPlaces: 1 }),
    ).toBe("-10.0");
  });

  it("carries prefix and suffix", () => {
    expect(
      formatNumericCell("1234", { numberFormat: "comma", prefix: "$" }),
    ).toBe("$1,234");
  });

  it("returns a non-numeric cell unchanged", () => {
    expect(formatNumericCell("n/a", {})).toBe("n/a");
  });
});

/**
 * Exponent notation is a number written a different way, not a different kind
 * of number. Expanding it through a double broke every guarantee this module
 * makes: `toFixed(20)` drops the only significant digit of 1e-21, and returns
 * exponent notation again at 1e21, which the thousands grouping then mangled
 * into "1e,+21".
 */
describe("exponent notation", () => {
  it("does not draw a value a double cannot hold", () => {
    expect(isNumericCell("1e309")).toBe(true); // it IS a number
    expect(toChartNumber("1e309")).toBeNull(); // but not a drawable one
    expect(toChartNumber("-1e309")).toBeNull();
  });

  it.each([
    ["1e-21", "0", 1],
    ["0", "1e-21", -1],
    ["1e-21", "1e-22", 1],
    ["1e21", "999999999999999999999", 1],
    ["1e3", "1000", 0],
    ["1.5e3", "1500", 0],
    ["-1e-21", "0", -1],
  ])("orders %s against %s", (a, b, sign) => {
    expect(Math.sign(compareNumericCells(a, b))).toBe(sign);
  });

  it.each([
    ["1e21", "plain", "1000000000000000000000"],
    ["1e21", "comma", "1,000,000,000,000,000,000,000"],
    ["1e-21", "plain", "0.000000000000000000001"],
    ["1.5e3", "comma", "1,500"],
    ["1.5e-3", "plain", "0.0015"],
    ["-2.5e2", "plain", "-250"],
  ])("formats %s as %s", (v, fmt, expected) => {
    expect(
      formatNumericCell(v, { numberFormat: fmt as "plain" | "comma" }),
    ).toBe(expected);
  });
});

/**
 * Past any expansion limit the value must still behave like a number. An
 * earlier cap handed raw exponent notation back to the digit operations, so
 * "9e5000" sorted above "1e5001" and grouping produced "1e5,000".
 */
describe("exponents too large to expand", () => {
  it.each([
    ["9e5000", "1e5001", -1],
    ["1e5001", "9e5000", 1],
    ["1e5000", "1e5000", 0],
    ["1e5000", "9.99e4999", 1],
    ["-9e5000", "-1e5001", 1],
    ["1e5000", "0", 1],
    ["-1e5000", "0", -1],
    ["1e-5000", "0", 1],
  ])("orders %s against %s", (a, b, sign) => {
    expect(Math.sign(compareNumericCells(a, b))).toBe(sign);
  });

  it.each([
    ["1e5000", "comma"],
    ["1e5000", "plain"],
    ["9.5e5000", "plain"],
    ["-1e-5000", "plain"],
  ])("falls back to scientific for %s in %s form", (v, fmt) => {
    const out = formatNumericCell(v, {
      numberFormat: fmt as "plain" | "comma",
    });
    // A defined scientific form, never digits with a comma spliced into them.
    expect(out).toMatch(/^-?\d(\.\d+)?e[+-]?\d+$/);
    expect(out).not.toContain(",");
  });
});
