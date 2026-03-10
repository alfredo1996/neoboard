import { describe, expect, it } from "vitest";
import { capturePreview } from "../capture-preview";

/**
 * capturePreview relies on DOM APIs (canvas, querySelector) which are not
 * available in Vitest's default (non-jsdom) environment. We test the routing
 * logic here: chart type → correct capture strategy → returns undefined when
 * no real DOM is present.
 *
 * Full visual capture is verified via Playwright E2E (widget-lab.spec.ts).
 */
describe("capturePreview", () => {
  // Minimal stub that satisfies HTMLElement shape for querySelector
  const fakeContainer = {
    querySelector: () => null,
  } as unknown as HTMLElement;

  it.each(["bar", "line", "pie", "single-value"])(
    "returns undefined for ECharts type '%s' when no canvas is present",
    (chartType) => {
      expect(capturePreview(fakeContainer, chartType)).toBeUndefined();
    },
  );

  it("returns undefined for table type when no table is present", () => {
    expect(capturePreview(fakeContainer, "table")).toBeUndefined();
  });

  it.each(["graph", "map", "json", "form", "parameter-select"])(
    "returns undefined for unsupported chart type '%s'",
    (chartType) => {
      expect(capturePreview(fakeContainer, chartType)).toBeUndefined();
    },
  );
});
