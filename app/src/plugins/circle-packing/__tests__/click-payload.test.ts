import { describe, it, expect } from "vitest";
import type { EChartsClickEvent } from "@neoboard/components";
import { circlePackingClickPayload } from "../click-payload";

/**
 * #1551 — circle packing declares `supportsClickAction: true` and the docs
 * promise "click a circle to navigate or set a parameter", but the payload was
 * meaningless.
 *
 * The shared `useEChartsClick` resolves the row as `data[e.dataIndex]`. For
 * every other ECharts plugin that works, because `data` is the row array the
 * series was built from. Circle packing is a custom series over a
 * d3-hierarchy pack: `data` is the nested tree while `dataIndex` indexes the
 * FLATTENED packed-node array. Two unrelated orderings, so the row was
 * arbitrary or undefined — and `e.name` was "" because the items carried no
 * name.
 *
 * The chart now puts the semantic fields on the item itself, so the payload
 * comes from the event rather than from an index lookup that cannot work.
 * The shared hook is left alone: every other plugin depends on it.
 */
function clickEvent(data: unknown, name = ""): EChartsClickEvent {
  return {
    componentType: "series",
    seriesType: "custom",
    seriesIndex: 0,
    name,
    dataIndex: 7, // deliberately meaningless here — that was the bug
    data,
    value: [0, 0, 10, 1, 42, "", "alpha", 0],
  };
}

describe("circlePackingClickPayload (#1551)", () => {
  it("takes the name from the clicked item", () => {
    const payload = circlePackingClickPayload(
      clickEvent({ name: "alpha", nodeValue: 42, depth: 1 }),
    );
    expect(payload.name).toBe("alpha");
  });

  it("takes the node's own value, not the packed geometry", () => {
    const payload = circlePackingClickPayload(
      clickEvent({ name: "alpha", nodeValue: 42, depth: 1 }),
    );
    expect(payload.value).toBe(42);
  });

  it("carries the depth so a click action can tell a leaf from a parent", () => {
    const payload = circlePackingClickPayload(
      clickEvent({ name: "root", nodeValue: 0, depth: 0 }),
    );
    expect(payload.depth).toBe(0);
  });

  it("never resolves against dataIndex", () => {
    // The whole defect: dataIndex is in packed-node space. A payload that
    // depended on it would be wrong for every non-trivial hierarchy.
    const payload = circlePackingClickPayload(
      clickEvent({ name: "beta", nodeValue: 7, depth: 2 }),
    );
    expect(payload.name).toBe("beta");
    expect(payload.value).toBe(7);
  });

  it("falls back to the event name when the item carries none", () => {
    expect(circlePackingClickPayload(clickEvent(undefined, "gamma")).name).toBe(
      "gamma",
    );
  });

  it("survives a malformed item without throwing", () => {
    expect(() => circlePackingClickPayload(clickEvent(null))).not.toThrow();
    expect(() =>
      circlePackingClickPayload(clickEvent("nonsense")),
    ).not.toThrow();
  });
});
