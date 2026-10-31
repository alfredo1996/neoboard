import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { cardOptionGroup } from "../chart-options-panel";
import { OPTION_GROUPS } from "../chart-options-schema";

/** The Card group the editor draws itself (#2394). */
function renderCard(
  props: Partial<Parameters<typeof cardOptionGroup>[0]> = {},
  search = "",
) {
  const onChange = vi.fn();
  const group = cardOptionGroup({
    canTint: true,
    settings: {},
    onChange,
    ...props,
  });
  render(<div>{group.render(search)}</div>);
  return { onChange, group };
}

describe("cardOptionGroup (#2394)", () => {
  it("is the first Style group", () => {
    expect(OPTION_GROUPS.Card).toBe("style");
    const style = Object.entries(OPTION_GROUPS).filter(
      ([, s]) => s === "style",
    );
    expect(style[0][0]).toBe("Card");
  });

  it("offers Default, None and four tints as named swatches, Default checked", () => {
    renderCard();
    const bg = screen.getByRole("radiogroup", { name: "Background" });
    const names = Array.from(bg.querySelectorAll("button")).map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(names).toEqual([
      "Default",
      "None",
      "Azure",
      "Citrine",
      "Sage",
      "Rose",
    ]);
    expect(screen.getByRole("radio", { name: "Default" })).toBeChecked();
  });

  it("an unknown stored background reads as Default", () => {
    renderCard({ settings: { cardBackground: "hotpink" } });
    expect(screen.getByRole("radio", { name: "Default" })).toBeChecked();
  });

  it("picking a swatch writes cardBackground", () => {
    const { onChange } = renderCard();
    fireEvent.click(screen.getByRole("radio", { name: "Rose" }));
    expect(onChange).toHaveBeenCalledWith("cardBackground", "rose");
  });

  it("a chart gets no Background row, only Description", () => {
    renderCard({ canTint: false });
    expect(screen.queryByText("Background")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
  });

  it("the description field stops at 200 characters and writes as typed", () => {
    const { onChange } = renderCard({ settings: { description: "Hi" } });
    const field = screen.getByLabelText("Description");
    expect(field).toHaveValue("Hi");
    expect(field).toHaveAttribute("maxlength", "200");
    fireEvent.change(field, { target: { value: "Hi there" } });
    expect(onChange).toHaveBeenCalledWith("description", "Hi there");
  });

  it("a Style search that matches no row hides the group", () => {
    const { group } = renderCard({}, "");
    expect(group.render("zzz")).toBeNull();
  });
});
