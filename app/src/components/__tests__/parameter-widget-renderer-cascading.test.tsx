import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParameterWidgetRenderer } from "../parameter-widget-renderer";
import { useParameterStore } from "@/stores/parameter-store";

/**
 * #1360 made cascading a *configuration* of select rather than its own widget
 * type, and the editor's "Depends On" input sits in the same block as the
 * "Allow multiple selections" checkbox — so a cascading multi-select is a
 * shape users can actually save.
 *
 * `parentParameterName` is optional all the way down the chain, so dropping it
 * on one branch is a silent regression TypeScript cannot catch: the widget
 * still renders, it just renders an enabled, permanently empty dropdown with
 * nothing explaining why. These tests pin the wiring itself, not the
 * component's rendering of it (that lives in the component package).
 */

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { tenantId: "t1" } }, status: "ready" }),
}));

// The seed query is the network edge — stub it so the render is deterministic.
// It never fires while the cascade is pending anyway (`enabled` is false).
vi.mock("@/hooks/use-seed-query", () => ({
  useSeedQuery: () => ({ options: [], loading: false }),
}));

// Stand-ins that surface the props we care about as data attributes.
vi.mock("@neoboard/components", () => ({
  ParamSelector: ({
    parameterName,
    parentParameterName,
    parentValue,
  }: {
    parameterName: string;
    parentParameterName?: string;
    parentValue?: string;
  }) => (
    <div
      data-testid="select"
      data-name={parameterName}
      data-parent={parentParameterName ?? ""}
      data-parent-value={parentValue ?? ""}
    />
  ),
  ParamMultiSelector: ({
    parameterName,
    parentParameterName,
    parentValue,
  }: {
    parameterName: string;
    parentParameterName?: string;
    parentValue?: string;
  }) => (
    <div
      data-testid="multi-select"
      data-name={parameterName}
      data-parent={parentParameterName ?? ""}
      data-parent-value={parentValue ?? ""}
    />
  ),
  TextInputParameter: () => <div data-testid="text" />,
  DatePickerParameter: () => <div data-testid="date" />,
  DateRangeParameter: () => <div data-testid="date-range" />,
  DateRelativePicker: () => <div data-testid="date-relative" />,
  NumberRangeSlider: () => <div data-testid="number-range" />,
}));

beforeEach(() => {
  useParameterStore.getState().clearAll();
});

describe("ParameterWidgetRenderer — cascading wiring", () => {
  it.each(["select", "multi-select"] as const)(
    "forwards parentParameterName to the %s widget",
    (parameterType) => {
      render(
        <ParameterWidgetRenderer
          parameterName="cities"
          parameterType={parameterType}
          connectionId="c1"
          seedQuery="SELECT 1"
          parentParameterName="country"
        />,
      );

      expect(screen.getByTestId(parameterType)).toHaveAttribute(
        "data-parent",
        "country",
      );
    },
  );

  it.each(["select", "multi-select"] as const)(
    "forwards the resolved parentValue to the %s widget once the parent is set",
    (parameterType) => {
      useParameterStore
        .getState()
        .setParameter(
          "country",
          "IT",
          "Parameter Selector",
          "country",
          "select",
        );

      render(
        <ParameterWidgetRenderer
          parameterName="cities"
          parameterType={parameterType}
          connectionId="c1"
          seedQuery="SELECT 1"
          parentParameterName="country"
        />,
      );

      expect(screen.getByTestId(parameterType)).toHaveAttribute(
        "data-parent-value",
        "IT",
      );
    },
  );

  it.each(["select", "multi-select"] as const)(
    "leaves the parent props empty for a plain %s",
    (parameterType) => {
      render(
        <ParameterWidgetRenderer
          parameterName="cities"
          parameterType={parameterType}
          connectionId="c1"
          seedQuery="SELECT 1"
        />,
      );

      const el = screen.getByTestId(parameterType);
      expect(el).toHaveAttribute("data-parent", "");
      expect(el).toHaveAttribute("data-parent-value", "");
    },
  );
});
