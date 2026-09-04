import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEChartsClick } from "../utils";

/**
 * #1589 — the click-action editor offers every raw query column as a Source
 * Field, but the payload was built from the transformed item alone, so a
 * column the transform dropped resolved to `undefined` and
 * `resolve-click-action.ts:78` discarded the action in silence.
 */
describe("useEChartsClick raw-row passthrough (#1589)", () => {
  const event = {
    name: "Design",
    value: 1,
    seriesName: "s",
    dataIndex: 0,
  } as Parameters<NonNullable<ReturnType<typeof useEChartsClick>>>[0];

  function payloadFor(item: Record<string, unknown>) {
    const onChartClick = vi.fn();
    const { result } = renderHook(() => useEChartsClick(onChartClick, [item]));
    result.current?.(event);
    return onChartClick.mock.calls[0][0] as Record<string, unknown>;
  }

  it("carries raw columns kept under properties into the payload", () => {
    const payload = payloadFor({
      task: "Design",
      start: 1,
      properties: { owner: "bob", region: "EU" },
    });
    expect(payload.owner).toBe("bob");
    expect(payload.region).toBe("EU");
  });

  it("lets the transformed item win over a raw column of the same name", () => {
    const payload = payloadFor({
      task: "Design",
      properties: { task: "raw-untransformed" },
    });
    expect(payload.task).toBe("Design");
  });

  it("never lets a raw column impersonate a click-resolution control key", () => {
    // resolve-click-action.ts:58,117,160 presence-test these to switch into the
    // table cell-click branch; a user column of that name would reroute the
    // click and then resolve to null.
    const payload = payloadFor({
      task: "Design",
      properties: { _clickedValue: "x", _clickedColumn: "y", owner: "bob" },
    });
    expect("_clickedValue" in payload).toBe(false);
    expect("_clickedColumn" in payload).toBe(false);
    expect(payload.owner).toBe("bob");
  });

  it("still works for an item with no properties", () => {
    const payload = payloadFor({ task: "Design", start: 1 });
    expect(payload.task).toBe("Design");
    expect(payload.dataIndex).toBe(0);
  });

  it("only strips the two real control keys, not every _clicked* column", () => {
    // _clickedValue and _clickedColumn are branch switches; a query column
    // named _clickedAt is ordinary data and must stay selectable.
    const payload = payloadFor({
      task: "Design",
      properties: { _clickedAt: "2026-01-01", _clickedValue: "x" },
    });
    expect(payload._clickedAt).toBe("2026-01-01");
    expect("_clickedValue" in payload).toBe(false);
  });

  it("lets a query column actually named `properties` through", () => {
    // The container must not shadow a user column of the same name.
    const payload = payloadFor({
      task: "Design",
      properties: { properties: "user-value", owner: "bob" },
    });
    expect(payload.properties).toBe("user-value");
    expect(payload.owner).toBe("bob");
  });
});
