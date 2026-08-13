import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ChartOptionsPanel } from "../chart-options-panel";
import { getChartOptions } from "../chart-options-schema";

// Same rationale as chart-options-panel.test.tsx: this is a heavy jsdom render.
vi.setConfig({ testTimeout: 15000 });

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function expandAllCategories() {
  screen
    .getAllByRole("button", { expanded: false })
    .forEach((btn) => fireEvent.click(btn));
}

/**
 * #1283 item 2b — an option's `description` was reachable only by hovering its
 * <Label>, which is not focusable, so keyboard and AT users got no description
 * at all. The dotted underline advertised content they could never open.
 *
 * The fix renders the description as real text referenced by `aria-describedby`
 * on the control, rather than trying to make a Label focusable.
 */
describe("#1283 item 2b — option descriptions reach assistive tech", () => {
  it("links every described option's control to its description text", () => {
    const described = getChartOptions("bar").filter((o) => o.description);
    // Guard: if the schema ever loses descriptions this test must not silently
    // pass by asserting nothing.
    expect(described.length).toBeGreaterThan(0);

    render(
      <ChartOptionsPanel
        chartType="bar"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expandAllCategories();

    for (const option of described) {
      const control = document.getElementById(option.key);
      if (!control) continue; // option not rendered for this chart config
      const describedBy = control.getAttribute("aria-describedby");
      expect(
        describedBy,
        `option "${option.key}" should reference its description`,
      ).toBeTruthy();

      const desc = document.getElementById(describedBy!);
      expect(desc).not.toBeNull();
      expect(desc).toHaveTextContent(option.description!);
    }
  });

  it("does not add aria-describedby to options without a description", () => {
    const plain = getChartOptions("bar").filter((o) => !o.description);
    render(
      <ChartOptionsPanel
        chartType="bar"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expandAllCategories();

    for (const option of plain) {
      const control = document.getElementById(option.key);
      if (!control) continue;
      expect(control).not.toHaveAttribute("aria-describedby");
    }
  });
});
