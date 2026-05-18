import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@neoboard/components", () => ({
  Label: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <label {...props}>{children}</label>
  ),
  TextInputParameter: ({ parameterName }: { parameterName: string }) => (
    <div data-testid={`text-${parameterName}`} />
  ),
  DatePickerParameter: ({ parameterName }: { parameterName: string }) => (
    <div data-testid={`date-${parameterName}`} />
  ),
  DateRangeParameter: ({ parameterName }: { parameterName: string }) => (
    <div data-testid={`date-range-${parameterName}`} />
  ),
  DateRelativePicker: ({ parameterName }: { parameterName: string }) => (
    <div data-testid={`date-relative-${parameterName}`} />
  ),
  NumberRangeSlider: ({
    parameterName,
    min,
    max,
    step,
  }: {
    parameterName: string;
    min: number;
    max: number;
    step: number;
  }) => (
    <div
      data-testid={`numrange-${parameterName}`}
      data-min={min}
      data-max={max}
      data-step={step}
    />
  ),
  ParamSelector: ({ parameterName }: { parameterName: string }) => (
    <div data-testid={`select-${parameterName}`} />
  ),
  ParamMultiSelector: ({ parameterName }: { parameterName: string }) => (
    <div data-testid={`multi-${parameterName}`} />
  ),
}));

import { ParameterPreview } from "../parameter-preview";

const baseProps = {
  paramUIType: "freetext" as const,
  dateSub: "single" as const,
  multiSelect: false,
  paramWidgetName: "",
  chartOptions: {} as Record<string, unknown>,
  seedPreviewOptions: null,
  seedQueryPending: false,
  seedQueryError: null,
};

describe("ParameterPreview", () => {
  it("renders the preview container with default label when name is empty", () => {
    render(<ParameterPreview {...baseProps} />);
    expect(screen.getByTestId("param-preview")).toBeInTheDocument();
    expect(screen.getByText("Parameter preview")).toBeInTheDocument();
  });

  it("renders $param_<name> label when name is set", () => {
    render(<ParameterPreview {...baseProps} paramWidgetName="country" />);
    expect(screen.getByText("$param_country")).toBeInTheDocument();
  });

  it("shows seed query error when provided", () => {
    render(
      <ParameterPreview {...baseProps} seedQueryError="Connection refused" />,
    );
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("renders NumberRangeSlider with chartOptions for number-range", () => {
    render(
      <ParameterPreview
        {...baseProps}
        paramUIType="number-range"
        paramWidgetName="rating"
        chartOptions={{ rangeMin: 1, rangeMax: 5, rangeStep: 1 }}
      />,
    );
    const slider = screen.getByTestId("numrange-rating");
    expect(slider).toBeInTheDocument();
    expect(slider.getAttribute("data-min")).toBe("1");
    expect(slider.getAttribute("data-max")).toBe("5");
    expect(slider.getAttribute("data-step")).toBe("1");
  });

  it("falls back to default min/max/step for number-range when chartOptions empty", () => {
    render(
      <ParameterPreview
        {...baseProps}
        paramUIType="number-range"
        chartOptions={{}}
      />,
    );
    const slider = screen.getByTestId("numrange-preview");
    expect(slider.getAttribute("data-min")).toBe("0");
    expect(slider.getAttribute("data-max")).toBe("100");
    expect(slider.getAttribute("data-step")).toBe("1");
  });

  it("renders DateRangeParameter for date + range subtype", () => {
    render(
      <ParameterPreview
        {...baseProps}
        paramUIType="date"
        dateSub="range"
        paramWidgetName="period"
      />,
    );
    expect(screen.getByTestId("date-range-period")).toBeInTheDocument();
  });
});
