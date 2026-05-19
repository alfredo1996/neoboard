import { describe, it, expect } from "vitest";
import { substituteParams, substituteParamsInUrl } from "../param-substitute";

describe("substituteParams", () => {
  it("substitutes a known param", () => {
    expect(substituteParams("Hello $param_name", { param_name: "World" })).toBe(
      "Hello World",
    );
  });

  it("leaves unknown params as-is", () => {
    expect(
      substituteParams("Hello $param_unknown", { param_name: "World" }),
    ).toBe("Hello $param_unknown");
  });

  it("returns original string when params record is undefined", () => {
    expect(substituteParams("Hello $param_name")).toBe("Hello $param_name");
  });

  it("returns original string when params record is empty", () => {
    expect(substituteParams("Hello $param_name", {})).toBe("Hello $param_name");
  });

  it("substitutes multiple params in one string", () => {
    expect(
      substituteParams("$param_greeting $param_name!", {
        param_greeting: "Hello",
        param_name: "World",
      }),
    ).toBe("Hello World!");
  });

  it("handles params in URLs", () => {
    expect(
      substituteParams("https://example.com?user=$param_user_id", {
        param_user_id: "42",
      }),
    ).toBe("https://example.com?user=42");
  });

  it("handles numeric values by converting to string", () => {
    expect(substituteParams("Count: $param_count", { param_count: 99 })).toBe(
      "Count: 99",
    );
  });

  it("handles null values by replacing with empty string", () => {
    expect(substituteParams("Value: $param_val", { param_val: null })).toBe(
      "Value: ",
    );
  });

  it("handles boolean values by converting to string", () => {
    expect(substituteParams("Enabled: $param_flag", { param_flag: true })).toBe(
      "Enabled: true",
    );
  });

  it("leaves a param untouched when it is not in the record but other params are", () => {
    expect(substituteParams("$param_a and $param_b", { param_a: "yes" })).toBe(
      "yes and $param_b",
    );
  });

  it("handles param names with underscores inside the name part", () => {
    expect(
      substituteParams("user: $param_user_id", { param_user_id: "7" }),
    ).toBe("user: 7");
  });

  it("does not substitute a word that is not prefixed with $param_", () => {
    expect(substituteParams("no_replacement", { param_replacement: "x" })).toBe(
      "no_replacement",
    );
  });

  it("handles an empty string input", () => {
    expect(substituteParams("", { param_a: "x" })).toBe("");
  });

  it("handles a string with no placeholders", () => {
    expect(substituteParams("no placeholders here", { param_a: "x" })).toBe(
      "no placeholders here",
    );
  });

  it("stringifies array values via String() (comma-joined)", () => {
    expect(
      substituteParams("In: $param_list", { param_list: ["a", "b", "c"] }),
    ).toBe("In: a,b,c");
  });

  it("stringifies object values via String() ([object Object])", () => {
    expect(
      substituteParams("Range: $param_range", {
        param_range: { from: "2024-01-01", to: "2024-01-31" },
      }),
    ).toBe("Range: [object Object]");
  });

  it("distinguishes explicit null (-> '') from a missing key (-> token)", () => {
    expect(substituteParams("X=$param_a", { param_a: null })).toBe("X=");
    expect(substituteParams("X=$param_a", {})).toBe("X=$param_a");
  });

  it("leaves a token unresolved when the longest match has no key, even if a shorter prefix has one", () => {
    // Greedy match consumes the whole word; lookup of "param_price_min" fails,
    // so the token is left as-is rather than silently substituting param_price.
    expect(substituteParams("$param_price_min", { param_price: "10" })).toBe(
      "$param_price_min",
    );
  });
});

describe("substituteParamsInUrl", () => {
  it("percent-encodes substituted values", () => {
    expect(
      substituteParamsInUrl("/search?q=$param_q", {
        param_q: "hello world & friends",
      }),
    ).toBe("/search?q=hello%20world%20%26%20friends");
  });

  it("encodes single quotes in array stringification", () => {
    expect(
      substituteParamsInUrl("/x?ids=$param_ids", {
        param_ids: ["a", "b's"],
      }),
    ).toBe("/x?ids=a%2Cb's");
  });

  it("neutralizes user-provided javascript: via percent-encoding (safe by encoding)", () => {
    // The colon is encoded, so the browser will not parse this as a javascript: URL.
    expect(
      substituteParamsInUrl("$param_url", { param_url: "javascript:alert(1)" }),
    ).toBe("javascript%3Aalert(1)");
  });

  it("returns # when the URL template itself starts with javascript:", () => {
    // Defense in depth — a misconfigured dashboard cannot smuggle a JS URL
    // through the template prefix.
    expect(
      substituteParamsInUrl("javascript:$param_x", { param_x: "alert(1)" }),
    ).toBe("#");
  });

  it("returns # when the URL template starts with javascript: regardless of case + leading whitespace", () => {
    expect(
      substituteParamsInUrl("  \tJaVaScRiPt:$param_x", { param_x: "alert(1)" }),
    ).toBe("#");
  });

  it("returns # when the URL template starts with data:", () => {
    expect(
      substituteParamsInUrl("data:text/html,$param_html", {
        param_html: "<script>alert(1)</script>",
      }),
    ).toBe("#");
  });

  it("leaves unresolved placeholders untouched (no encoding)", () => {
    expect(substituteParamsInUrl("/x?id=$param_missing", {})).toBe(
      "/x?id=$param_missing",
    );
  });

  it("returns original url when params record is undefined", () => {
    expect(substituteParamsInUrl("/x?id=$param_a")).toBe("/x?id=$param_a");
  });
});
