/**
 * A preview re-run (the debounced auto-preview firing after Run) starts a
 * fresh mutation whose `data` is undefined until it settles. The widget editor
 * derives its column pickers from that data, so a tab of the editor unmounted
 * under an open dropdown mid-run, and the e2e failed with "element was detached from the DOM".
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSettledData } from "../use-settled-data";

type State = {
  isPending: boolean;
  data: unknown;
  isStopped?: boolean;
  variables?: { query: string; connectionId?: string; database?: string };
};

function setup(initial: State) {
  return renderHook((s: State) => useSettledData(s), { initialProps: initial });
}

describe("useSettledData", () => {
  it("returns the data of a settled mutation", () => {
    const { result } = setup({ isPending: false, data: { rows: 1 } });
    expect(result.current).toEqual({ rows: 1 });
  });

  it("keeps the last settled data while a re-run is pending", () => {
    const first = { rows: 1 };
    const { result, rerender } = setup({ isPending: false, data: first });
    rerender({ isPending: true, data: undefined });
    expect(result.current).toBe(first);
  });

  it("switches to the new data once the re-run settles", () => {
    const { result, rerender } = setup({ isPending: false, data: { rows: 1 } });
    rerender({ isPending: true, data: undefined });
    rerender({ isPending: false, data: { rows: 2 } });
    expect(result.current).toEqual({ rows: 2 });
  });

  it("clears on reset or error, which settle with no data", () => {
    const { result, rerender } = setup({ isPending: false, data: { rows: 1 } });
    rerender({ isPending: false, data: undefined });
    expect(result.current).toBeUndefined();
  });

  it("is undefined when the first run is still pending", () => {
    const { result } = setup({ isPending: true, data: undefined });
    expect(result.current).toBeUndefined();
  });

  // #2445: Stop leaves no data, but the pickers keep the columns of the last
  // run when the stopped query is that run's own text.
  it("keeps the last data after a stop of the same query text", () => {
    const first = { rows: 1 };
    const { result, rerender } = setup({
      isPending: false,
      data: first,
      variables: { query: "RETURN 1" },
    });
    rerender({
      isPending: true,
      data: undefined,
      variables: { query: "RETURN 1" },
    });
    rerender({
      isPending: false,
      data: undefined,
      isStopped: true,
      variables: { query: "RETURN 1" },
    });
    expect(result.current).toBe(first);
  });

  it("clears after a stop of a changed query text", () => {
    const { result, rerender } = setup({
      isPending: false,
      data: { rows: 1 },
      variables: { query: "RETURN 1" },
    });
    rerender({
      isPending: false,
      data: undefined,
      isStopped: true,
      variables: { query: "RETURN 2" },
    });
    expect(result.current).toBeUndefined();
  });

  it.each([
    ["connection", { connectionId: "B" }, { connectionId: "A" }],
    [
      "database",
      { connectionId: "A", database: "y" },
      { connectionId: "A", database: "x" },
    ],
  ])(
    "clears after a stop of the same text on another %s",
    (_n, stopped, ran) => {
      const { result, rerender } = setup({
        isPending: false,
        data: { rows: 1 },
        variables: { query: "RETURN 1", ...ran },
      });
      rerender({
        isPending: false,
        data: undefined,
        isStopped: true,
        variables: { query: "RETURN 1", ...stopped },
      });
      expect(result.current).toBeUndefined();
    },
  );
});
