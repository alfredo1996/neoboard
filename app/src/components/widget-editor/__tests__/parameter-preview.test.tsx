import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock @neoboard/components so we render lightweight stand-ins. Each preview
// branch is responsible for rendering its specific widget — we assert the
// right one fires by tagging the mock with a data-testid that carries the
// props we want to inspect.
vi.mock("@neoboard/components", () => ({
  Label: ({ children }: React.PropsWithChildren) => <label>{children}</label>,
  TextInputParameter: ({
    parameterName,
    placeholder,
  }: {
    parameterName: string;
    placeholder?: string;
  }) => (
    <div
      data-testid="text"
      data-name={parameterName}
      data-placeholder={placeholder}
    />
  ),
  DatePickerParameter: ({ parameterName }: { parameterName: string }) => (
    <div data-testid="date-single" data-name={parameterName} />
  ),
  DateRangeParameter: ({ parameterName }: { parameterName: string }) => (
    <div data-testid="date-range" data-name={parameterName} />
  ),
  DateRelativePicker: ({ parameterName }: { parameterName: string }) => (
    <div data-testid="date-relative" data-name={parameterName} />
  ),
  ParamSelector: ({
    parameterName,
    loading,
    options,
    placeholder,
    parentParameterName,
  }: {
    parameterName: string;
    loading?: boolean;
    options: { value: string; label: string }[];
    placeholder?: string;
    parentParameterName?: string;
  }) => (
    <div
      data-testid="select-single"
      data-name={parameterName}
      data-loading={String(loading ?? false)}
      data-option-count={options.length}
      data-placeholder={placeholder ?? ""}
      data-parent={parentParameterName ?? ""}
    />
  ),
  ParamMultiSelector: ({
    parameterName,
    options,
  }: {
    parameterName: string;
    options: { value: string; label: string }[];
  }) => (
    <div
      data-testid="select-multi"
      data-name={parameterName}
      data-option-count={options.length}
    />
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
      data-testid="number-range"
      data-name={parameterName}
      data-min={min}
      data-max={max}
      data-step={step}
    />
  ),
}));

import { ParameterPreview } from "../parameter-preview";

const baseProps = {
  paramUIType: "freetext" as const,
  dateSub: "single" as const,
  multiSelect: false,
  paramWidgetName: "city",
  chartOptions: {},
  seedPreviewOptions: null,
  seedQueryPending: false,
};

describe("ParameterPreview", () => {
  it("shows the param name label with $param_ prefix", () => {
    render(<ParameterPreview {...baseProps} />);
    expect(screen.getByText("$param_city")).toBeInTheDocument();
  });

  it("falls back to a generic label when name is empty", () => {
    render(<ParameterPreview {...baseProps} paramWidgetName="" />);
    expect(screen.getByText("Parameter preview")).toBeInTheDocument();
  });

  it("renders TextInputParameter for freetext type", () => {
    render(
      <ParameterPreview
        {...baseProps}
        paramUIType="freetext"
        chartOptions={{ placeholder: "type here" }}
      />,
    );
    const el = screen.getByTestId("text");
    expect(el).toHaveAttribute("data-placeholder", "type here");
    expect(el).toHaveAttribute("data-name", "city");
  });

  it("renders single date picker when dateSub=single", () => {
    render(
      <ParameterPreview {...baseProps} paramUIType="date" dateSub="single" />,
    );
    expect(screen.getByTestId("date-single")).toBeInTheDocument();
  });

  it("renders date range when dateSub=range", () => {
    render(
      <ParameterPreview {...baseProps} paramUIType="date" dateSub="range" />,
    );
    expect(screen.getByTestId("date-range")).toBeInTheDocument();
  });

  it("renders relative date when dateSub=relative", () => {
    render(
      <ParameterPreview {...baseProps} paramUIType="date" dateSub="relative" />,
    );
    expect(screen.getByTestId("date-relative")).toBeInTheDocument();
  });

  it("renders single select when not multiSelect", () => {
    render(<ParameterPreview {...baseProps} paramUIType="select" />);
    const el = screen.getByTestId("select-single");
    expect(el).toHaveAttribute("data-option-count", "3");
    expect(el).toHaveAttribute("data-loading", "false");
  });

  it("renders multi-select when multiSelect=true", () => {
    render(
      <ParameterPreview
        {...baseProps}
        paramUIType="select"
        multiSelect={true}
      />,
    );
    expect(screen.getByTestId("select-multi")).toBeInTheDocument();
  });

  it("uses seedPreviewOptions when provided, falling back to defaults otherwise", () => {
    const { rerender } = render(
      <ParameterPreview
        {...baseProps}
        paramUIType="select"
        seedPreviewOptions={[{ value: "a", label: "A" }]}
      />,
    );
    expect(screen.getByTestId("select-single")).toHaveAttribute(
      "data-option-count",
      "1",
    );
    rerender(
      <ParameterPreview
        {...baseProps}
        paramUIType="select"
        seedPreviewOptions={null}
      />,
    );
    expect(screen.getByTestId("select-single")).toHaveAttribute(
      "data-option-count",
      "3",
    );
  });

  it("propagates seedQueryPending as loading state", () => {
    render(
      <ParameterPreview
        {...baseProps}
        paramUIType="select"
        seedQueryPending={true}
      />,
    );
    expect(screen.getByTestId("select-single")).toHaveAttribute(
      "data-loading",
      "true",
    );
  });

  it("renders seedQueryError text when present", () => {
    render(
      <ParameterPreview
        {...baseProps}
        paramUIType="select"
        seedQueryError="bad SQL"
      />,
    );
    expect(screen.getByText("bad SQL")).toBeInTheDocument();
  });

  describe("number-range branch", () => {
    it("renders with chartOptions min/max/step", () => {
      render(
        <ParameterPreview
          {...baseProps}
          paramUIType="number-range"
          chartOptions={{ rangeMin: 5, rangeMax: 50, rangeStep: 2 }}
        />,
      );
      const el = screen.getByTestId("number-range");
      expect(el).toHaveAttribute("data-min", "5");
      expect(el).toHaveAttribute("data-max", "50");
      expect(el).toHaveAttribute("data-step", "2");
    });

    it("falls back to defaults (0..100, step 1) when chartOptions are missing", () => {
      render(<ParameterPreview {...baseProps} paramUIType="number-range" />);
      const el = screen.getByTestId("number-range");
      expect(el).toHaveAttribute("data-min", "0");
      expect(el).toHaveAttribute("data-max", "100");
      expect(el).toHaveAttribute("data-step", "1");
    });

    it("guards against max <= min by clamping to min + 1", () => {
      // Regression: the slider crashes when min === max — the preview must
      // not propagate that into the rendered widget.
      render(
        <ParameterPreview
          {...baseProps}
          paramUIType="number-range"
          chartOptions={{ rangeMin: 10, rangeMax: 10 }}
        />,
      );
      const el = screen.getByTestId("number-range");
      expect(el).toHaveAttribute("data-min", "10");
      expect(el).toHaveAttribute("data-max", "11");
    });

    it("guards against max < min", () => {
      render(
        <ParameterPreview
          {...baseProps}
          paramUIType="number-range"
          chartOptions={{ rangeMin: 10, rangeMax: 5 }}
        />,
      );
      expect(screen.getByTestId("number-range")).toHaveAttribute(
        "data-max",
        "11",
      );
    });

    it("ignores invalid step (0 or non-numeric)", () => {
      render(
        <ParameterPreview
          {...baseProps}
          paramUIType="number-range"
          chartOptions={{ rangeStep: 0 }}
        />,
      );
      expect(screen.getByTestId("number-range")).toHaveAttribute(
        "data-step",
        "1",
      );
    });

    it("ignores non-numeric min/max", () => {
      render(
        <ParameterPreview
          {...baseProps}
          paramUIType="number-range"
          chartOptions={{ rangeMin: "abc", rangeMax: null }}
        />,
      );
      const el = screen.getByTestId("number-range");
      expect(el).toHaveAttribute("data-min", "0");
      expect(el).toHaveAttribute("data-max", "100");
    });
  });

  // Cascading is a configuration of `select`, not its own branch (#1360).
  describe("cascading configuration of the select branch", () => {
    it("passes the configured parent through to the select preview", () => {
      render(
        <ParameterPreview
          {...baseProps}
          paramUIType="select"
          chartOptions={{ parentParameterName: "region" }}
        />,
      );
      expect(screen.getByTestId("select-single")).toHaveAttribute(
        "data-parent",
        "region",
      );
    });

    it("leaves the parent empty for a plain select", () => {
      render(<ParameterPreview {...baseProps} paramUIType="select" />);
      expect(screen.getByTestId("select-single")).toHaveAttribute(
        "data-parent",
        "",
      );
    });

    it("propagates placeholder from chartOptions", () => {
      render(
        <ParameterPreview
          {...baseProps}
          paramUIType="select"
          chartOptions={{ placeholder: "Pick a city" }}
        />,
      );
      expect(screen.getByTestId("select-single")).toHaveAttribute(
        "data-placeholder",
        "Pick a city",
      );
    });

    it("leaves placeholder unset so the component can prompt for the parent", () => {
      render(
        <ParameterPreview
          {...baseProps}
          paramUIType="select"
          chartOptions={{ parentParameterName: "region" }}
        />,
      );
      expect(screen.getByTestId("select-single")).toHaveAttribute(
        "data-placeholder",
        "",
      );
    });
  });
});
