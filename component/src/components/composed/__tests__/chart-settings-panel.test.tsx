import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { useState } from "react";
import { ChartSettingsPanel } from "../chart-settings-panel";
import type { SettingsGroup } from "../chart-settings-panel";
import { chartOptionGroups } from "../chart-options-panel";
import type { OptionSection } from "../chart-options-schema";

vi.setConfig({ testTimeout: 15000 });

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

const data: SettingsGroup[] = [
  { name: "Query", render: () => <p>query box</p> },
  { name: "Transform", render: () => <p>transform steps</p> },
];

function Harness({
  chartType,
  extra = [],
  start = "data",
}: Readonly<{
  chartType: string;
  extra?: SettingsGroup[];
  start?: OptionSection;
}>) {
  const [section, setSection] = useState<OptionSection>(start);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  return (
    <ChartSettingsPanel
      searchable
      section={section}
      onSectionChange={setSection}
      groups={[
        ...extra,
        ...chartOptionGroups({
          chartType,
          settings,
          onSettingsChange: setSettings,
        }),
      ]}
    />
  );
}

const sectionNames = () =>
  within(screen.getByRole("tablist", { name: "Editor sections" }))
    .getAllByRole("tab")
    .map((t) => t.textContent);

describe("ChartSettingsPanel (#2388)", () => {
  it("lists Data, Style and Behavior as vertical tabs that predict their contents", () => {
    render(<Harness chartType="bar" extra={data} />);
    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-orientation",
      "vertical",
    );
    expect(sectionNames()).toEqual(["Data", "Style", "Behavior"]);
    expect(screen.getByText("query box")).toBeInTheDocument();
  });

  it("hides a section with nothing in it: a markdown widget has Content and Style and nothing else", () => {
    render(<Harness chartType="markdown" start="content" />);
    expect(sectionNames()).toEqual(["Content", "Style"]);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("falls back to the first section when the one on show is gone", () => {
    render(<Harness chartType="markdown" extra={[]} start="behavior" />);
    expect(screen.getByRole("tab", { name: "Content" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("puts the jump links outside the tablist, and none for a single group", () => {
    render(<Harness chartType="bar" extra={data} />);
    const jumps = screen.getByRole("navigation", { name: "Jump to a group" });
    expect(
      screen.getByRole("tablist").contains(jumps),
      "links inside the tablist fail axe",
    ).toBe(false);
    expect(
      within(jumps)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Query", "Transform"]);
  });

  it("shows the active section's groups in the fixed order, as links too", () => {
    render(<Harness chartType="bar" start="style" />);
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "Bars",
      "Axes",
      "Legend",
      "Data labels",
      "Color",
      "Reference lines",
    ]);
    expect(
      within(screen.getByRole("navigation", { name: "Jump to a group" }))
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(headings);
  });

  it("a jump link scrolls the pane to its group", () => {
    render(<Harness chartType="bar" start="style" />);
    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    expect(
      screen.getByTestId("editor-pane").scrollTo,
      "the pane scrolls, not the page",
    ).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("searches Style only, and a miss says the rest is in Behavior", () => {
    // Rules is one block, not option rows: only its name can match.
    render(
      <Harness
        chartType="bar"
        start="style"
        extra={[{ name: "Rules", named: true, render: () => <p>rule list</p> }]}
      />,
    );
    const search = screen.getByRole("textbox", { name: "Search options" });
    fireEvent.change(search, { target: { value: "legend" } });
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Legend"]);
    fireEvent.change(search, { target: { value: "refresh" } });
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(screen.getByText(/The rest is in Behavior/)).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "rules" } });
    expect(screen.getByText("rule list")).toBeInTheDocument();
    // The section row stays: a search never hides a section.
    expect(sectionNames()).toEqual(["Style", "Behavior"]);
  });

  it("names a section on keyboard focus with a tooltip, for the icon rail", async () => {
    render(<Harness chartType="bar" start="style" />);
    fireEvent.focus(screen.getByRole("tab", { name: "Behavior" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Behavior");
  });

  it("joins groups of the same name under one heading", () => {
    render(
      <Harness
        chartType="bar"
        start="behavior"
        extra={[{ name: "Refresh", render: () => <p>from the app</p> }]}
      />,
    );
    expect(screen.getAllByRole("heading", { name: "Refresh" })).toHaveLength(1);
    expect(screen.getByText("from the app")).toBeInTheDocument();
    expect(screen.getByLabelText("Refresh button")).toBeInTheDocument();
  });
});
