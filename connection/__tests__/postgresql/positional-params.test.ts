/**
 * Named → positional parameters for node-pg. Moved here from the app (#1898):
 * the app sends every connector the same named map, and how the names reach
 * the driver is this connector's business. No container needed.
 */
import { toPositionalParams } from "../../src/postgresql/positional-params";

describe("toPositionalParams", () => {
  it("rewrites $param_xxx to positional $1, $2, ... with the values in that order", () => {
    expect(
      toPositionalParams(
        "SELECT * FROM users WHERE name = $param_name AND age > $param_age",
        // Map order is the opposite of text order: the TEXT decides.
        { param_age: 30, param_name: "Alice" },
      ),
    ).toEqual({
      text: "SELECT * FROM users WHERE name = $1 AND age > $2",
      values: ["Alice", 30],
    });
  });

  it("reuses the same positional index for a repeated token", () => {
    expect(
      toPositionalParams("SELECT * FROM t WHERE a = $param_x OR b = $param_x", {
        param_x: 42,
      }),
    ).toEqual({ text: "SELECT * FROM t WHERE a = $1 OR b = $1", values: [42] });
  });

  it("returns the query untouched when it has no $param_ tokens", () => {
    expect(toPositionalParams("SELECT 1", {})).toEqual({
      text: "SELECT 1",
      values: [],
    });
  });

  it("handles multiple distinct params in order", () => {
    expect(
      toPositionalParams(
        "INSERT INTO t (a, b, c) VALUES ($param_a, $param_b, $param_c)",
        { param_a: 1, param_b: "two", param_c: null },
      ),
    ).toEqual({
      text: "INSERT INTO t (a, b, c) VALUES ($1, $2, $3)",
      values: [1, "two", null],
    });
  });

  it("keeps 10+ params in text order, not lexicographic order", () => {
    const names = Array.from({ length: 12 }, (_, i) => `param_c${i}`);
    const params = Object.fromEntries(names.map((n, i) => [n, `val_${i}`]));
    const { text, values } = toPositionalParams(
      names.map((n) => `$${n}`).join(","),
      params,
    );
    expect(text).toBe("$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12");
    expect(values).toEqual(names.map((_, i) => `val_${i}`));
  });

  // #1516: binding `undefined` for an absent token made node-pg send NULL, so
  // `LIMIT $param_x` became `LIMIT NULL` — no limit — and the query SUCCEEDED
  // with the wrong rows. Ten widgets in the shipped demo rendered that way.
  // Missing now throws, matching what Neo4j already does.
  it("throws and names the parameter when a referenced token is absent", () => {
    expect(() => toPositionalParams("SELECT $param_missing", {})).toThrow(
      /param_missing/,
    );
  });

  it("names every absent parameter, not just the first", () => {
    expect(() =>
      toPositionalParams("SELECT $param_a, $param_b", { param_a: 1 }),
    ).toThrow(/param_b/);
    expect(() => toPositionalParams("SELECT $param_a, $param_b", {})).toThrow(
      /param_a.*param_b/,
    );
  });

  it("never puts a value in the missing-parameter message", () => {
    expect(() =>
      toPositionalParams("SELECT $param_a, $param_b", { param_a: "s3cret" }),
    ).toThrow(/^Expected parameter\(s\): param_b$/);
  });

  // An explicit null is a legitimate value and must stay bindable — it is the
  // distinction `undefined` could not express. `Object.hasOwn`, so falsy
  // values bind too and an inherited key does not count as supplied.
  it.each([[null], [0], [""], [false]])(
    "binds the falsy value %p without throwing",
    (value) => {
      expect(toPositionalParams("SELECT $param_x", { param_x: value })).toEqual(
        { text: "SELECT $1", values: [value] },
      );
    },
  );

  it("does not take an inherited key for a supplied parameter", () => {
    const params = Object.create({ param_x: 1 }) as Record<string, unknown>;
    expect(() => toPositionalParams("SELECT $param_x", params)).toThrow(
      /param_x/,
    );
  });

  // The demo's number-range knobs read `$param_x_max` while the store holds
  // `param_x`, so a prefix-greedy match would bind the wrong value (#1517).
  it("treats a token whose name prefixes another as a distinct parameter", () => {
    expect(
      toPositionalParams(
        "SELECT * FROM t WHERE n > $param_x LIMIT $param_x_max",
        { param_x: 5, param_x_max: 12 },
      ),
    ).toEqual({
      text: "SELECT * FROM t WHERE n > $1 LIMIT $2",
      values: [5, 12],
    });
  });

  it("handles params with underscores in names", () => {
    expect(
      toPositionalParams("SELECT $param_start_date", {
        param_start_date: "2024-01-01",
      }),
    ).toEqual({ text: "SELECT $1", values: ["2024-01-01"] });
  });

  it("binds only what the text references — an unreferenced key is dropped", () => {
    expect(
      toPositionalParams("SELECT $param_a", { param_a: 1, param_b: 2 }),
    ).toEqual({ text: "SELECT $1", values: [1] });
  });

  // Nothing but `$param_xxx` tokens is ever rewritten: the user's own `$1`, a
  // dollar-quoted body and a cast all reach the driver exactly as written.
  it.each([
    ["SELECT $1"],
    ["SELECT $$it's $param$$ AS s, $tag$x$tag$ AS t"],
    ["SELECT '1'::int, \"$col\" FROM t -- $1"],
  ])("leaves %p alone", (query) => {
    expect(toPositionalParams(query, { "0": "ignored" })).toEqual({
      text: query,
      values: [],
    });
  });

  // Pinned, not endorsed: this is a token swap, not a SQL tokenizer, so a
  // token inside a string literal or a comment is rewritten (and required)
  // like any other — exactly as it was in the app.
  it("rewrites a token inside a literal or a comment too", () => {
    expect(
      toPositionalParams("SELECT '$param_x' -- $param_x", { param_x: 1 }),
    ).toEqual({ text: "SELECT '$1' -- $1", values: [1] });
  });
});
