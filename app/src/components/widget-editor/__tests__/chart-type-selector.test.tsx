import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@neoboard/components", () => ({
  Label: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <label {...props}>{children}</label>
  ),
  Combobox: ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
  }) => (
    <select
      data-testid={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/lib/plugin/chart-helpers", () => ({
  getChartConfig: (type: string) => ({
    label: type.charAt(0).toUpperCase() + type.slice(1),
  }),
}));

vi.mock("lucide-react", async (importOriginal) => {
  const Icon = () => <span />;
  const actual = await importOriginal<Record<string, unknown>>();
  const mocked: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    mocked[key] = Icon;
  }
  return mocked;
});

import {
  ChartTypeSelector,
  getChartTypeMeta,
  chartTypeIcons,
} from "../chart-type-selector";
import type { ChartType } from "@/lib/plugin/chart-helpers";

describe("getChartTypeMeta", () => {
  it("returns label from chart config and icon from map", () => {
    const meta = getChartTypeMeta("bar");
    expect(meta.label).toBe("Bar");
    expect(meta.Icon).toBeDefined();
  });

  it("returns fallback icon for unknown type", () => {
    const meta = getChartTypeMeta("unknown-type" as ChartType);
    expect(meta.Icon).toBeDefined();
  });
});

describe("chartTypeIcons", () => {
  it("has entries for all 20 chart types", () => {
    const expected = [
      "bar",
      "line",
      "pie",
      "single-value",
      "graph",
      "map",
      "table",
      "json",
      "parameter-select",
      "form",
      "markdown",
      "iframe",
      "gauge",
      "sankey",
      "sunburst",
      "radar",
      "treemap",
      "gantt",
      "circle-packing",
      "choropleth",
    ];
    for (const type of expected) {
      expect(chartTypeIcons[type as ChartType]).toBeDefined();
    }
  });
});

const connections = [
  { id: "c1", name: "Neo4j Local", type: "neo4j" },
  { id: "c2", name: "Postgres Prod", type: "postgresql" },
];
const chartTypes: ChartType[] = ["bar", "line", "pie", "table"];

describe("ChartTypeSelector", () => {
  it("renders chart type selector without connection when showConnection is false", () => {
    render(
      <ChartTypeSelector
        connectionId=""
        onConnectionChange={vi.fn()}
        chartType="bar"
        onChartTypeChange={vi.fn()}
        compatibleChartTypes={chartTypes}
        connections={connections}
        showConnection={false}
      />,
    );
    expect(screen.getByText("Chart Type")).toBeInTheDocument();
    expect(screen.queryByText("Connection")).not.toBeInTheDocument();
  });

  it("renders both connection and chart type when showConnection is true", () => {
    render(
      <ChartTypeSelector
        connectionId="c1"
        onConnectionChange={vi.fn()}
        chartType="bar"
        onChartTypeChange={vi.fn()}
        compatibleChartTypes={chartTypes}
        connections={connections}
        showConnection={true}
      />,
    );
    expect(screen.getByText("Chart Type")).toBeInTheDocument();
    expect(screen.getByText("Connection")).toBeInTheDocument();
  });

  it("calls onChartTypeChange when chart type changes", () => {
    const onChartTypeChange = vi.fn();
    render(
      <ChartTypeSelector
        connectionId=""
        onConnectionChange={vi.fn()}
        chartType="bar"
        onChartTypeChange={onChartTypeChange}
        compatibleChartTypes={chartTypes}
        connections={connections}
        showConnection={false}
      />,
    );
    fireEvent.change(screen.getByTestId("Select chart type..."), {
      target: { value: "line" },
    });
    expect(onChartTypeChange).toHaveBeenCalledWith("line");
  });

  it("calls onConnectionChange when connection changes", () => {
    const onConnectionChange = vi.fn();
    render(
      <ChartTypeSelector
        connectionId="c1"
        onConnectionChange={onConnectionChange}
        chartType="bar"
        onChartTypeChange={vi.fn()}
        compatibleChartTypes={chartTypes}
        connections={connections}
        showConnection={true}
      />,
    );
    fireEvent.change(screen.getByTestId("Select a connection..."), {
      target: { value: "c2" },
    });
    expect(onConnectionChange).toHaveBeenCalledWith("c2");
  });

  it("renders chart type options from compatibleChartTypes", () => {
    render(
      <ChartTypeSelector
        connectionId=""
        onConnectionChange={vi.fn()}
        chartType="bar"
        onChartTypeChange={vi.fn()}
        compatibleChartTypes={chartTypes}
        connections={connections}
        showConnection={false}
      />,
    );
    expect(screen.getByText("Bar")).toBeInTheDocument();
    expect(screen.getByText("Line")).toBeInTheDocument();
    expect(screen.getByText("Pie")).toBeInTheDocument();
    expect(screen.getByText("Table")).toBeInTheDocument();
  });

  it("renders connection options with name and type", () => {
    render(
      <ChartTypeSelector
        connectionId="c1"
        onConnectionChange={vi.fn()}
        chartType="bar"
        onChartTypeChange={vi.fn()}
        compatibleChartTypes={chartTypes}
        connections={connections}
        showConnection={true}
      />,
    );
    expect(screen.getByText("Neo4j Local (neo4j)")).toBeInTheDocument();
    expect(screen.getByText("Postgres Prod (postgresql)")).toBeInTheDocument();
  });

  it("shows required indicator on connection label", () => {
    render(
      <ChartTypeSelector
        connectionId="c1"
        onConnectionChange={vi.fn()}
        chartType="bar"
        onChartTypeChange={vi.fn()}
        compatibleChartTypes={chartTypes}
        connections={connections}
        showConnection={true}
      />,
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });
});
