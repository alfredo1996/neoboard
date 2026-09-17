import { bindNamedParams } from "../src/sql";

describe("bindNamedParams", () => {
  const twoParams = "SELECT * FROM t WHERE a = $param_a AND b = $param_b";

  it.each([
    ["postgres", "SELECT * FROM t WHERE a = $1 AND b = $2"],
    ["mysql", "SELECT * FROM t WHERE a = ? AND b = ?"],
    ["mssql", "SELECT * FROM t WHERE a = @p1 AND b = @p2"],
  ] as const)(
    "rewrites to %s placeholders and returns values in binding order",
    (dialect, query) => {
      expect(
        bindNamedParams(twoParams, { param_b: 2, param_a: "one" }, dialect),
      ).toEqual({ query, values: ["one", 2] });
    },
  );

  const repeated = "SELECT * FROM t WHERE a = $param_x OR b = $param_x";

  it("reuses one slot for a repeated name where the placeholder names it", () => {
    expect(bindNamedParams(repeated, { param_x: 42 }, "postgres")).toEqual({
      query: "SELECT * FROM t WHERE a = $1 OR b = $1",
      values: [42],
    });
    expect(bindNamedParams(repeated, { param_x: 42 }, "mssql")).toEqual({
      query: "SELECT * FROM t WHERE a = @p1 OR b = @p1",
      values: [42],
    });
  });

  it("repeats the value for a repeated name under positional ? placeholders", () => {
    expect(bindNamedParams(repeated, { param_x: 42 }, "mysql")).toEqual({
      query: "SELECT * FROM t WHERE a = ? OR b = ?",
      values: [42, 42],
    });
  });

  it("leaves a string literal alone, even one that looks like a placeholder", () => {
    expect(
      bindNamedParams(
        "SELECT '$param_a costs $1', $param_b",
        { param_b: 2 },
        "postgres",
      ),
    ).toEqual({ query: "SELECT '$param_a costs $1', $1", values: [2] });
  });

  it.each([
    ["a line comment", "-- $param_a\nSELECT $param_b", "-- $param_a\nSELECT ?"],
    [
      "a block comment",
      "SELECT /* $param_a */ $param_b",
      "SELECT /* $param_a */ ?",
    ],
    ["a # comment", "SELECT $param_b # $param_a", "SELECT ? # $param_a"],
    [
      "a double-quoted string",
      'SELECT "$param_a", $param_b',
      'SELECT "$param_a", ?',
    ],
    [
      "a backtick identifier",
      "SELECT `$param_a`, $param_b",
      "SELECT `$param_a`, ?",
    ],
    [
      "a backslash-escaped quote",
      "SELECT 'it\\'s $param_a', $param_b",
      "SELECT 'it\\'s $param_a', ?",
    ],
  ])("mysql: skips %s", (_name, sql, query) => {
    expect(bindNamedParams(sql, { param_b: 2 }, "mysql")).toEqual({
      query,
      values: [2],
    });
  });

  it("mssql: skips a bracket identifier", () => {
    expect(
      bindNamedParams("SELECT [$param_a], $param_b", { param_b: 2 }, "mssql"),
    ).toEqual({ query: "SELECT [$param_a], @p1", values: [2] });
  });

  it("postgres: rewrites inside an array subscript, which is not a quoted identifier there", () => {
    expect(
      bindNamedParams(
        "SELECT tags[$param_i] FROM t",
        { param_i: 1 },
        "postgres",
      ),
    ).toEqual({ query: "SELECT tags[$1] FROM t", values: [1] });
  });

  it("throws naming every missing parameter once", () => {
    expect(() =>
      bindNamedParams("SELECT $param_a, $param_b, $param_a", {}, "mysql"),
    ).toThrow("Expected parameter(s): param_a, param_b");
  });

  it("binds an explicit null", () => {
    expect(
      bindNamedParams("SELECT $param_x", { param_x: null }, "mssql"),
    ).toEqual({ query: "SELECT @p1", values: [null] });
  });

  it("treats a name that prefixes another as a distinct parameter", () => {
    expect(
      bindNamedParams(
        "SELECT * FROM t WHERE n > $param_x LIMIT $param_x_max",
        { param_x: 5, param_x_max: 12 },
        "postgres",
      ),
    ).toEqual({
      query: "SELECT * FROM t WHERE n > $1 LIMIT $2",
      values: [5, 12],
    });
  });

  it("returns a query without tokens unchanged", () => {
    expect(bindNamedParams("SELECT 1", {}, "mysql")).toEqual({
      query: "SELECT 1",
      values: [],
    });
  });

  it("rewrites the raw text past an unterminated literal and leaves the syntax error to the server", () => {
    expect(
      bindNamedParams("SELECT 'open $param_a", { param_a: 1 }, "postgres"),
    ).toEqual({ query: "SELECT 'open $1", values: [1] });
  });

  it("never splices a value into the query text", () => {
    const hostile = "x'); DROP TABLE t; --";
    expect(
      bindNamedParams("SELECT $param_a", { param_a: hostile }, "mssql"),
    ).toEqual({ query: "SELECT @p1", values: [hostile] });
  });
});
