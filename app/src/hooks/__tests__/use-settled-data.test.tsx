/**
 * A preview re-run (the debounced auto-preview firing after Run) starts a
 * fresh mutation whose `data` is undefined until it settles. The widget editor
 * derives its column pickers from that data, so the Transform tab unmounted
 * under an open dropdown mid-run — transforms.spec.ts "a configured filter
 * actually filters the preview" failed with "element was detached from the DOM".
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSettledData } from "../use-settled-data";

type State = { isPending: boolean; data: unknown };

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
});
