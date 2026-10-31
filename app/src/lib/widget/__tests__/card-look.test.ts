import { describe, it, expect, vi } from "vitest";
import type { DashboardWidget } from "@/lib/db/schema";
import type { ParameterEntry } from "@/stores/parameter-store";

vi.mock("@/lib/plugin/chart-helpers", () => ({
  chartSupportsCardBackground: (t: string) => t === "table" || t === "markdown",
}));

import { cardLook } from "../card-look";

const widget = (
  chartType: string,
  settings: Record<string, unknown>,
): DashboardWidget => ({
  id: "w",
  chartType,
  connectionId: "c",
  query: "q",
  settings,
});

const params = {
  region: { value: "EMEA" } as ParameterEntry,
};

describe("cardLook (#2394)", () => {
  it("reads the background and description a card can show", () => {
    expect(
      cardLook(
        widget("table", { cardBackground: "rose", description: " About " }),
        {},
      ),
    ).toEqual({ background: "rose", description: "About" });
  });

  it("a chart ignores a stored background but keeps its description", () => {
    expect(
      cardLook(
        widget("bar", { cardBackground: "rose", description: "About" }),
        {},
      ),
    ).toEqual({ background: "default", description: "About" });
  });

  it("an unknown background reads as Default", () => {
    expect(cardLook(widget("table", { cardBackground: "pink" }), {})).toEqual({
      background: "default",
      description: "",
    });
  });

  it("substitutes filter parameters in the description, as in the title", () => {
    expect(
      cardLook(
        widget("table", { description: "Sales in $param_region" }),
        params,
      ).description,
    ).toBe("Sales in EMEA");
  });

  it("an unset parameter shows its name in words, in brackets", () => {
    expect(
      cardLook(widget("table", { description: "In $param_region" }), {})
        .description,
    ).toBe("In [Region]");
  });

  it("a description that is not text reads as empty", () => {
    expect(
      cardLook(widget("table", { description: { a: 1 } }), {}).description,
    ).toBe("");
  });
});
