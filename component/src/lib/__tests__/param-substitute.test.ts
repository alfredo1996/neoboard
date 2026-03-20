import { describe, it, expect } from "vitest";
import { substituteParams } from "../param-substitute";

describe("substituteParams", () => {
  it("substitutes a known param", () => {
    expect(
      substituteParams("Hello $param_name", { param_name: "World" })
    ).toBe("Hello World");
  });

  it("leaves unknown params as-is", () => {
    expect(
      substituteParams("Hello $param_unknown", { param_name: "World" })
    ).toBe("Hello $param_unknown");
  });

  it("returns original string when params record is undefined", () => {
    expect(substituteParams("Hello $param_name")).toBe("Hello $param_name");
  });

  it("returns original string when params record is empty", () => {
    expect(substituteParams("Hello $param_name", {})).toBe(
      "Hello $param_name"
    );
  });

  it("substitutes multiple params in one string", () => {
    expect(
      substituteParams("$param_greeting $param_name!", {
        param_greeting: "Hello",
        param_name: "World",
      })
    ).toBe("Hello World!");
  });

  it("handles params in URLs", () => {
    expect(
      substituteParams("https://example.com?user=$param_user_id", {
        param_user_id: "42",
      })
    ).toBe("https://example.com?user=42");
  });

  it("handles numeric values by converting to string", () => {
    expect(
      substituteParams("Count: $param_count", { param_count: 99 })
    ).toBe("Count: 99");
  });

  it("handles null values by replacing with empty string", () => {
    expect(
      substituteParams("Value: $param_val", { param_val: null })
    ).toBe("Value: ");
  });

  it("handles boolean values by converting to string", () => {
    expect(
      substituteParams("Enabled: $param_flag", { param_flag: true })
    ).toBe("Enabled: true");
  });

  it("leaves a param untouched when it is not in the record but other params are", () => {
    expect(
      substituteParams("$param_a and $param_b", { param_a: "yes" })
    ).toBe("yes and $param_b");
  });

  it("handles param names with underscores inside the name part", () => {
    expect(
      substituteParams("user: $param_user_id", { param_user_id: "7" })
    ).toBe("user: 7");
  });

  it("does not substitute a word that is not prefixed with $param_", () => {
    expect(
      substituteParams("no_replacement", { param_replacement: "x" })
    ).toBe("no_replacement");
  });

  it("handles an empty string input", () => {
    expect(substituteParams("", { param_a: "x" })).toBe("");
  });

  it("handles a string with no placeholders", () => {
    expect(substituteParams("no placeholders here", { param_a: "x" })).toBe(
      "no placeholders here"
    );
  });
});
