import {
  integerToRowValue,
  isGraphNode,
  isGraphPath,
  isGraphRelationship,
  toIsoDuration,
} from "../src/generalized/row-value";

describe("graph value guards", () => {
  it("read the $type tag and nothing else", () => {
    // A tagged value with none of the usual keys is still what its tag says:
    // consumers must never fall back to guessing from key names.
    expect(isGraphNode({ $type: "node" })).toBe(true);
    expect(isGraphRelationship({ $type: "relationship" })).toBe(true);
    expect(isGraphPath({ $type: "path" })).toBe(true);
  });

  it("reject a look-alike that carries no tag", () => {
    // The false positive the tag exists to close: a JSON column that happens
    // to hold `labels` and `properties` is a plain object, not a node.
    expect(isGraphNode({ labels: ["Person"], properties: {} })).toBe(false);
    expect(isGraphRelationship({ type: "KNOWS", start: 1, end: 2 })).toBe(
      false,
    );
    expect(isGraphPath({ start: {}, end: {}, segments: [] })).toBe(false);
  });

  it("do not confuse one tag for another", () => {
    expect(isGraphNode({ $type: "relationship" })).toBe(false);
    expect(isGraphRelationship({ $type: "path" })).toBe(false);
    expect(isGraphPath({ $type: "node" })).toBe(false);
  });

  it.each([null, undefined, 42, "node", true, ["node"]])(
    "reject the non-object %p",
    (value) => {
      expect(isGraphNode(value)).toBe(false);
      expect(isGraphRelationship(value)).toBe(false);
      expect(isGraphPath(value)).toBe(false);
    },
  );
});

describe("integerToRowValue", () => {
  it("returns a number inside the safe range", () => {
    expect(integerToRowValue(42n)).toBe(42);
    expect(integerToRowValue(-42n)).toBe(-42);
    expect(integerToRowValue(9007199254740991n)).toBe(9007199254740991);
    expect(integerToRowValue(-9007199254740991n)).toBe(-9007199254740991);
  });

  it("returns a decimal string beyond it — never rounded, never a BigInt", () => {
    expect(integerToRowValue(9007199254740993n)).toBe("9007199254740993");
    expect(integerToRowValue(-9007199254740993n)).toBe("-9007199254740993");
    expect(integerToRowValue(9223372036854775807n)).toBe("9223372036854775807");
  });
});

describe("toIsoDuration", () => {
  const zero = { months: 0, days: 0, seconds: 0, nanoseconds: 0 };

  it("renders a zero duration as PT0S", () => {
    expect(toIsoDuration(zero)).toBe("PT0S");
  });

  it("carries months into years and seconds into hours and minutes", () => {
    expect(
      toIsoDuration({
        months: 14,
        days: 3,
        seconds: 3723,
        nanoseconds: 500_000_000,
      }),
    ).toBe("P1Y2M3DT1H2M3.5S");
  });

  it("omits every zero component", () => {
    expect(toIsoDuration({ ...zero, months: 12 })).toBe("P1Y");
    expect(toIsoDuration({ ...zero, days: 40 })).toBe("P40D");
    expect(toIsoDuration({ ...zero, seconds: 120 })).toBe("PT2M");
    expect(toIsoDuration({ ...zero, months: 1, days: 2, seconds: 3 })).toBe(
      "P1M2DT3S",
    );
  });

  it("never carries days into hours or months into days", () => {
    // A day is not 24 hours across a DST change and a month is not 30 days.
    expect(toIsoDuration({ ...zero, seconds: 90_000 })).toBe("PT25H");
    expect(toIsoDuration({ ...zero, days: 45 })).toBe("P45D");
  });

  it("signs every non-zero component of a negative duration", () => {
    expect(
      toIsoDuration({ months: -14, days: -3, seconds: -3723, nanoseconds: 0 }),
    ).toBe("P-1Y-2M-3DT-1H-2M-3S");
  });

  it("keeps a mixed-sign duration component by component", () => {
    expect(
      toIsoDuration({ months: 1, days: -2, seconds: 3, nanoseconds: 0 }),
    ).toBe("P1M-2DT3S");
    expect(
      toIsoDuration({ months: -1, days: 2, seconds: -3, nanoseconds: 0 }),
    ).toBe("P-1M2DT-3S");
  });

  it("reads seconds and nanoseconds as ONE signed quantity", () => {
    // Some drivers normalise -1.5s as seconds -2 plus 500 000 000 positive
    // nanoseconds. Formatting the two fields apart would print -2.5.
    expect(
      toIsoDuration({ ...zero, seconds: -2, nanoseconds: 500_000_000 }),
    ).toBe("PT-1.5S");
    expect(
      toIsoDuration({ ...zero, seconds: -1, nanoseconds: -500_000_000 }),
    ).toBe("PT-1.5S");
  });

  it("keeps nanosecond precision and trims trailing zeros", () => {
    expect(toIsoDuration({ ...zero, nanoseconds: 1 })).toBe("PT0.000000001S");
    expect(
      toIsoDuration({ ...zero, seconds: -1, nanoseconds: 999_999_999 }),
    ).toBe("PT-0.000000001S");
    expect(toIsoDuration({ ...zero, nanoseconds: 123_000_000 })).toBe(
      "PT0.123S",
    );
  });

  it("stays exact beyond the safe-integer range", () => {
    expect(toIsoDuration({ ...zero, seconds: 9007199254740993n })).toBe(
      "PT2501999792983H36M33S",
    );
    expect(toIsoDuration({ ...zero, months: 120000000000000001n })).toBe(
      "P10000000000000000Y1M",
    );
  });
});
