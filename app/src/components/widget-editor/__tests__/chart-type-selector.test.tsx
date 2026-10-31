import React from "react";
import { describe, it, expect, vi } from "vitest";
import { CHART_TYPES } from "@/plugins/chart-types";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@neoboard/components", async () => ({
  SettingRow: ({
    label,
    htmlFor,
    children,
  }: React.PropsWithChildren<{ label: string; htmlFor?: string }>) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  ),
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
    id,
    "aria-label": ariaLabel,
  }: {
    id?: string;
    "aria-label"?: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string; hint?: string }[];
    placeholder?: string;
  }) => (
    <select
      id={id}
      aria-label={ariaLabel}
      data-testid={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.hint ? `${o.label} ${o.hint}` : o.label}
        </option>
      ))}
    </select>
  ),
}));

// Labels no rule could derive from the type (#1905).
vi.mock("@/hooks/use-connectors", () => ({
  useConnectors: () => ({
    data: [
      { type: "neo4j", label: "Graph Store" },
      { type: "postgresql", label: "Relational Store" },
    ],
  }),
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
  ChartTypeSelect,
  ConnectionSelect,
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
  it("has exactly one icon per CHART_TYPES entry", () => {
    // Pinned to the registry rather than a hand-copied list: an icon for a
    // type the app no longer registers (#1687 removed treemap and
    // circle-packing) would be dead code, and a missing one a blank button.
    expect(Object.keys(chartTypeIcons).sort()).toEqual([...CHART_TYPES].sort());
  });
});

const connections = [
  { id: "c1", name: "Neo4j Local", type: "neo4j" },
  { id: "c2", name: "Postgres Prod", type: "postgresql" },
];
const chartTypes: ChartType[] = ["bar", "line", "pie", "table"];

describe("ChartTypeSelect (the editor header)", () => {
  function renderSelect(onChartTypeChange = vi.fn()) {
    render(
      <ChartTypeSelect
        chartType="bar"
        onChartTypeChange={onChartTypeChange}
        compatibleChartTypes={chartTypes}
      />,
    );
  }

  it("is named Chart Type without a visible label beside it", () => {
    renderSelect();
    expect(
      screen.getByRole("combobox", { name: "Chart Type" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });

  it("offers the compatible chart types", () => {
    renderSelect();
    expect(screen.getByText("Bar")).toBeInTheDocument();
    expect(screen.getByText("Line")).toBeInTheDocument();
    expect(screen.getByText("Pie")).toBeInTheDocument();
    expect(screen.getByText("Table")).toBeInTheDocument();
  });

  it("calls onChartTypeChange when the type changes", () => {
    const onChartTypeChange = vi.fn();
    renderSelect(onChartTypeChange);
    fireEvent.change(screen.getByTestId("Select chart type..."), {
      target: { value: "line" },
    });
    expect(onChartTypeChange).toHaveBeenCalledWith("line");
  });
});

describe("ConnectionSelect (a row of the Query group)", () => {
  it("is named by its label (#2217)", () => {
    render(
      <ConnectionSelect
        connectionId="c1"
        onConnectionChange={vi.fn()}
        connections={connections}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: /Connection/ }),
    ).toBeInTheDocument();
  });

  // #1905: each entry read "Neo4j Local (neo4j)" — the raw type.
  it("names each connection's connector by its descriptor label", () => {
    render(
      <ConnectionSelect
        connectionId="c1"
        onConnectionChange={vi.fn()}
        connections={[
          ...connections,
          { id: "c3", name: "Legacy", type: "uninstalled" },
        ]}
      />,
    );
    const labels = Array.from(
      screen.getByTestId("Select a connection...").querySelectorAll("option"),
    ).map((o) => o.textContent);
    expect(labels).toEqual([
      "Select a connection...",
      "Neo4j Local Graph Store",
      "Postgres Prod Relational Store",
      // No descriptor to ask: its type is the only name left.
      "Legacy uninstalled",
    ]);
  });

  it("calls onConnectionChange when the connection changes", () => {
    const onConnectionChange = vi.fn();
    render(
      <ConnectionSelect
        connectionId="c1"
        onConnectionChange={onConnectionChange}
        connections={connections}
      />,
    );
    fireEvent.change(screen.getByTestId("Select a connection..."), {
      target: { value: "c2" },
    });
    expect(onConnectionChange).toHaveBeenCalledWith("c2");
  });
});
