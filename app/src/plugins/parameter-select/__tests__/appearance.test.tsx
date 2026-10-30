import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";
import { parameterSelectSettingsSchema } from "../settings";

vi.mock("@neoboard/components", () => ({
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  getChartOptions: () => [],
}));
vi.mock("@/components/parameter-widget-renderer", () => ({
  ParameterWidgetRenderer: () => <input aria-label="field" />,
}));

const { parameterSelectPlugin } = await import("../index");
const Component = parameterSelectPlugin.component as React.ComponentType<
  Record<string, unknown>
>;

const parse = (raw: unknown) =>
  safeParseSettings(parameterSelectSettingsSchema, raw, "parameter-select");

describe("filter fill and border settings (#2368)", () => {
  it("default to 'default' when absent", () => {
    expect(parse({ parameterName: "p" })).toMatchObject({
      fieldFill: "default",
      fieldBorder: "default",
    });
  });

  it("keeps a valid choice", () => {
    expect(
      parse({ parameterName: "p", fieldFill: "rose", fieldBorder: "ink" }),
    ).toMatchObject({ fieldFill: "rose", fieldBorder: "ink" });
  });

  it("reads an unknown colour as default and keeps the parameter name", () => {
    const s = parse({
      parameterName: "p",
      fieldFill: "#ff0000",
      fieldBorder: "azure",
    });
    expect(s.parameterName).toBe("p");
    expect(s.fieldFill).toBe("default");
    expect(s.fieldBorder).toBe("azure");
  });
});

describe("parameter-select wrapper (#2368)", () => {
  const renderWith = (settings: Record<string, unknown>) =>
    render(
      <Component
        settings={{ parameterName: "p", ...settings }}
        connectionId="c"
        widgetId="w"
      />,
    );

  it("carries the chosen fill and border as data attributes", () => {
    renderWith({ fieldFill: "azure", fieldBorder: "citrine" });
    const wrapper = screen.getByLabelText("field").parentElement!;
    expect(wrapper).toHaveAttribute("data-field-fill", "azure");
    expect(wrapper).toHaveAttribute("data-field-border", "citrine");
  });

  it("carries neither attribute when nothing is chosen", () => {
    renderWith({});
    const wrapper = screen.getByLabelText("field").parentElement!;
    expect(wrapper).not.toHaveAttribute("data-field-fill");
    expect(wrapper).not.toHaveAttribute("data-field-border");
  });

  it("a bad colour never reaches the attribute", () => {
    renderWith({ fieldFill: "#ff0000" });
    const wrapper = screen.getByLabelText("field").parentElement!;
    expect(wrapper).not.toHaveAttribute("data-field-fill");
  });
});
