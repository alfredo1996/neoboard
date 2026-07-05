import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "../toggle";
import { ToggleGroup, ToggleGroupItem } from "../toggle-group";

describe("Toggle (#1129 E2)", () => {
  it("toggles aria-pressed on click", async () => {
    const user = userEvent.setup();
    render(<Toggle>Bold</Toggle>);
    const btn = screen.getByRole("button", { name: "Bold" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    await user.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("uses the canonical accent for the pressed state", () => {
    render(<Toggle pressed>On</Toggle>);
    const cls = screen.getByRole("button", { name: "On" }).className;
    expect(cls).toContain("data-[state=on]:bg-accent");
    expect(cls).toContain("data-[state=on]:text-accent-foreground");
  });

  it("outline variant carries the Button outline rest treatment", () => {
    render(<Toggle variant="outline">O</Toggle>);
    const cls = screen.getByRole("button", { name: "O" }).className;
    expect(cls).toContain("border-input");
  });

  it("respects disabled", async () => {
    const user = userEvent.setup();
    render(<Toggle disabled>D</Toggle>);
    const btn = screen.getByRole("button", { name: "D" });
    await user.click(btn).catch(() => {});
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("ToggleGroup (#1129 E2)", () => {
  it("single mode keeps at most one item pressed", async () => {
    const user = userEvent.setup();
    render(
      <ToggleGroup type="single">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </ToggleGroup>,
    );
    const a = screen.getByRole("radio", { name: "A" });
    const b = screen.getByRole("radio", { name: "B" });
    await user.click(a);
    expect(a.getAttribute("data-state")).toBe("on");
    await user.click(b);
    expect(b.getAttribute("data-state")).toBe("on");
    expect(a.getAttribute("data-state")).toBe("off");
  });

  it("multiple mode allows several pressed items", async () => {
    const user = userEvent.setup();
    render(
      <ToggleGroup type="multiple">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </ToggleGroup>,
    );
    const a = screen.getByRole("button", { name: "A" });
    const b = screen.getByRole("button", { name: "B" });
    await user.click(a);
    await user.click(b);
    expect(a.getAttribute("data-state")).toBe("on");
    expect(b.getAttribute("data-state")).toBe("on");
  });

  it("items inherit variant/size from the group context", () => {
    render(
      <ToggleGroup type="single" variant="outline">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(screen.getByRole("radio", { name: "A" }).className).toContain(
      "border-input",
    );
  });
});
