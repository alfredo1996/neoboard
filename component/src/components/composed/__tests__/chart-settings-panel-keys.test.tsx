import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ChartSettingsPanel } from "../chart-settings-panel";

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

// Own file: React warns once per component, so a warning an earlier test in a
// shared file already raised would hide a regression here.
describe("ChartSettingsPanel children", () => {
  it("joins two groups of one name without a React key warning", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ChartSettingsPanel
        section="behavior"
        onSectionChange={vi.fn()}
        groups={[
          { name: "Refresh", render: () => <p>one</p> },
          { name: "Refresh", render: () => <p>two</p> },
        ]}
      />,
    );
    const keyWarnings = errors.mock.calls.filter((c) =>
      String(c[0]).includes("unique"),
    );
    errors.mockRestore();
    expect(keyWarnings).toHaveLength(0);
  });
});
