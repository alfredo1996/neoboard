import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ColorScalePanel } from "../conditional-format-panel";
import type { ColorScaleConfig } from "@/charts/styling-rule";

const COLUMNS = ["name", "score", "status"];

describe("ColorScalePanel", () => {
  it("renders empty state with add button", () => {
    render(
      <ColorScalePanel
        columns={COLUMNS}
        colorScales={[]}
        onColorScalesChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /add color scale/i })).toBeInTheDocument();
  });

  it("renders existing color scales", () => {
    const scales: ColorScaleConfig[] = [
      { column: "score", minColor: "#ef4444", maxColor: "#22c55e" },
    ];
    render(
      <ColorScalePanel
        columns={COLUMNS}
        colorScales={scales}
        onColorScalesChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /remove color scale/i })).toBeInTheDocument();
  });

  it("adds a color scale", async () => {
    const user = userEvent.setup();
    const onColorScalesChange = vi.fn();
    render(
      <ColorScalePanel
        columns={COLUMNS}
        colorScales={[]}
        onColorScalesChange={onColorScalesChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add color scale/i }));
    expect(onColorScalesChange).toHaveBeenCalledTimes(1);
    const scales = onColorScalesChange.mock.calls[0][0] as ColorScaleConfig[];
    expect(scales).toHaveLength(1);
    expect(scales[0].column).toBe(COLUMNS[0]);
  });

  it("removes a color scale", async () => {
    const user = userEvent.setup();
    const onColorScalesChange = vi.fn();
    const scales: ColorScaleConfig[] = [
      { column: "score", minColor: "#ef4444", maxColor: "#22c55e" },
    ];
    render(
      <ColorScalePanel
        columns={COLUMNS}
        colorScales={scales}
        onColorScalesChange={onColorScalesChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /remove color scale/i }));
    expect(onColorScalesChange).toHaveBeenCalledWith([]);
  });
});
