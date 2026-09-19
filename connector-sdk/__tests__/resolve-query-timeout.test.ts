import { DEFAULT_CONNECTION_CONFIG } from "../src/generalized/interfaces";
import { resolveQueryTimeout } from "../src/generalized/resolve-query-timeout";

// #1898: the app passes `config.timeout` only for an explicit per-query
// override; otherwise the connector resolves its own default from the timeout
// field IT declares. Whatever happens, the query stays bounded (#1302).
describe("resolveQueryTimeout", () => {
  it("uses the connector's configured timeout when there is no override", () => {
    expect(resolveQueryTimeout(undefined, 12_345)).toBe(12_345);
  });

  it("lets an explicit per-query override win", () => {
    expect(resolveQueryTimeout(777, 12_345)).toBe(777);
  });

  it("falls back to the default when nothing is configured", () => {
    expect(resolveQueryTimeout(undefined, undefined)).toBe(30_000);
    expect(resolveQueryTimeout(undefined)).toBe(30_000);
  });

  it.each([[0], [-1], [Number.NaN], [null], ["5000"], [Infinity]])(
    "never takes %p for a timeout — a query is always bounded",
    (bad) => {
      expect(resolveQueryTimeout(bad, bad)).toBe(30_000);
      expect(resolveQueryTimeout(bad, 12_345)).toBe(12_345);
    },
  );

  it("reads the default at call time, not at import", () => {
    const saved = DEFAULT_CONNECTION_CONFIG.timeout;
    DEFAULT_CONNECTION_CONFIG.timeout = 250;
    try {
      expect(resolveQueryTimeout(undefined, undefined)).toBe(250);
    } finally {
      DEFAULT_CONNECTION_CONFIG.timeout = saved;
    }
  });
});
