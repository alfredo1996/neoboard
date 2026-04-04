import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChartSettingsPanel } from "../chart-settings-panel";

describe("ChartSettingsPanel", () => {
  it("renders data and style tabs", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data content</div>}
        styleTab={<div>Style content</div>}
      />,
    );
    expect(screen.getByRole("tab", { name: "Data" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Style" })).toBeInTheDocument();
  });

  it("shows data tab content by default", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data content</div>}
        styleTab={<div>Style content</div>}
      />,
    );
    expect(screen.getByText("Data content")).toBeInTheDocument();
  });

  it("renders advanced tab when provided", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data</div>}
        styleTab={<div>Style</div>}
        advancedTab={<div>Advanced</div>}
      />,
    );
    expect(screen.getByRole("tab", { name: "Advanced" })).toBeInTheDocument();
  });

  it("does not render advanced tab when not provided", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data</div>}
        styleTab={<div>Style</div>}
      />,
    );
    expect(
      screen.queryByRole("tab", { name: "Advanced" }),
    ).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ChartSettingsPanel
        dataTab={<div>Data</div>}
        styleTab={<div>Style</div>}
        className="my-panel"
      />,
    );
    expect(container.firstChild).toHaveClass("my-panel");
  });

  it("renders transform tab when provided", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data</div>}
        styleTab={<div>Style</div>}
        transformTab={<div>Transform content</div>}
      />,
    );
    expect(screen.getByRole("tab", { name: "Transform" })).toBeInTheDocument();
  });

  it("does not render transform tab when not provided", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data</div>}
        styleTab={<div>Style</div>}
      />,
    );
    expect(
      screen.queryByRole("tab", { name: "Transform" }),
    ).not.toBeInTheDocument();
  });

  it("resets to defaultTab when resetKey changes", () => {
    const { rerender } = render(
      <ChartSettingsPanel
        dataTab={<div>Data content</div>}
        styleTab={<div>Style content</div>}
        resetKey="bar"
        defaultTab="data"
      />,
    );
    // Initially data tab content is shown
    expect(screen.getByText("Data content")).toBeInTheDocument();

    // Re-render with a new resetKey — tabs should re-mount (key change)
    rerender(
      <ChartSettingsPanel
        dataTab={<div>Data content v2</div>}
        styleTab={<div>Style content v2</div>}
        resetKey="line"
        defaultTab="data"
      />,
    );
    // The tabs reset — data tab should be active again
    expect(screen.getByText("Data content v2")).toBeInTheDocument();
  });

  it("uses defaultTab as initial active tab", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data content</div>}
        styleTab={<div>Style content</div>}
        defaultTab="style"
      />,
    );
    expect(screen.getByText("Style content")).toBeInTheDocument();
  });
});
