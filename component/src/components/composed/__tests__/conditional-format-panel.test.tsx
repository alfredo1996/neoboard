import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ConditionalFormatPanel } from "../conditional-format-panel";
import type { CellFormatRule, ColorScaleConfig } from "@/charts/styling-rule";

const COLUMNS = ["name", "score", "status"];

describe("ConditionalFormatPanel", () => {
  it("renders empty state with add button", () => {
    render(
      <ConditionalFormatPanel
        columns={COLUMNS}
        rules={[]}
        colorScales={[]}
        onRulesChange={() => {}}
        onColorScalesChange={() => {}}
      />,
    );
    expect(screen.getByText("No rules configured.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add rule/i })).toBeInTheDocument();
  });

  it("renders existing rules", () => {
    const rules: CellFormatRule[] = [
      {
        id: "r1",
        column: "score",
        operator: ">=",
        value: 80,
        style: { backgroundColor: "#22c55e" },
      },
    ];
    render(
      <ConditionalFormatPanel
        columns={COLUMNS}
        rules={rules}
        colorScales={[]}
        onRulesChange={() => {}}
        onColorScalesChange={() => {}}
      />,
    );
    expect(screen.queryByText("No rules configured.")).not.toBeInTheDocument();
    // The rule's column should be visible
    expect(screen.getByDisplayValue("80")).toBeInTheDocument();
  });

  it("adds a new rule when Add Rule is clicked", async () => {
    const user = userEvent.setup();
    const onRulesChange = vi.fn();
    render(
      <ConditionalFormatPanel
        columns={COLUMNS}
        rules={[]}
        colorScales={[]}
        onRulesChange={onRulesChange}
        onColorScalesChange={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add rule/i }));
    expect(onRulesChange).toHaveBeenCalledTimes(1);
    const newRules = onRulesChange.mock.calls[0][0] as CellFormatRule[];
    expect(newRules).toHaveLength(1);
    expect(newRules[0].column).toBe(COLUMNS[0]);
  });

  it("removes a rule when delete is clicked", async () => {
    const user = userEvent.setup();
    const onRulesChange = vi.fn();
    const rules: CellFormatRule[] = [
      { id: "r1", column: "score", operator: ">=", value: 80, style: { backgroundColor: "#22c55e" } },
    ];
    render(
      <ConditionalFormatPanel
        columns={COLUMNS}
        rules={rules}
        colorScales={[]}
        onRulesChange={onRulesChange}
        onColorScalesChange={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /remove rule/i }));
    expect(onRulesChange).toHaveBeenCalledWith([]);
  });

  it("renders color scale section", () => {
    render(
      <ConditionalFormatPanel
        columns={COLUMNS}
        rules={[]}
        colorScales={[]}
        onRulesChange={() => {}}
        onColorScalesChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /add color scale/i })).toBeInTheDocument();
  });

  it("adds a color scale", async () => {
    const user = userEvent.setup();
    const onColorScalesChange = vi.fn();
    render(
      <ConditionalFormatPanel
        columns={COLUMNS}
        rules={[]}
        colorScales={[]}
        onRulesChange={() => {}}
        onColorScalesChange={onColorScalesChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add color scale/i }));
    expect(onColorScalesChange).toHaveBeenCalledTimes(1);
    const scales = onColorScalesChange.mock.calls[0][0] as ColorScaleConfig[];
    expect(scales).toHaveLength(1);
    expect(scales[0].column).toBe(COLUMNS[0]);
  });
});
