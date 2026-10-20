import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "../switch";

describe("Switch (#2218)", () => {
  it("toggles aria-checked from the keyboard", async () => {
    render(<Switch aria-label="Auto refresh" />);
    const sw = screen.getByRole("switch", { name: "Auto refresh" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.tab();
    await userEvent.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("says nothing in words unless stateLabel is set", () => {
    render(<Switch aria-label="x" checked />);
    expect(screen.queryByText("On")).toBeNull();
  });

  it("the state word follows a controlled checked", () => {
    const { rerender } = render(<Switch aria-label="x" stateLabel checked />);
    expect(screen.getByText("On")).toBeInTheDocument();
    rerender(<Switch aria-label="x" stateLabel checked={false} />);
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("the state word follows an uncontrolled switch as it is toggled", async () => {
    render(<Switch aria-label="x" stateLabel defaultChecked />);
    expect(screen.getByText("On")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("keeps the word out of the accessible name", () => {
    render(<Switch aria-label="Auto refresh" stateLabel checked />);
    expect(screen.getByText("On")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("switch", { name: "Auto refresh" })).toBeVisible();
  });

  // jsdom computes no layout: assert the size and hit-area classes.
  it("has a hit area that reaches 24px (44px coarse)", () => {
    render(<Switch aria-label="x" />);
    const cls = screen.getByRole("switch").className;
    expect(cls).toContain("after:-inset-y-[3px]");
    expect(cls).toContain("[@media(pointer:coarse)]:after:-inset-y-[13px]");
  });

  it("the off track is the field border grey, not a fainter token", () => {
    render(<Switch aria-label="x" />);
    expect(screen.getByRole("switch").className).toContain(
      "data-[state=unchecked]:bg-input",
    );
  });
});
