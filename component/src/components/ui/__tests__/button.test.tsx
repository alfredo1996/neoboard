import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button, buttonVariants } from "../button";
import { LoadingButton } from "../../composed/loading-button";

const variants = [
  "primary",
  "secondary",
  "ghost",
  "link",
  "danger",
  "danger-confirm",
] as const;

describe("Button (#2216)", () => {
  it.each(variants)("%s renders an enabled button named by its label", (v) => {
    render(<Button variant={v}>Run</Button>);
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  });

  it("is primary when no variant is given, on Button and LoadingButton", () => {
    expect(buttonVariants()).toBe(buttonVariants({ variant: "primary" }));
    render(<LoadingButton>Go</LoadingButton>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveClass(
      ...buttonVariants({ variant: "primary" }).split(" "),
    );
  });

  it("disabled drops the button out of the interaction", () => {
    render(
      <Button variant="danger" disabled>
        Delete
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it.each(["icon", "icon-sm"] as const)(
    "a %s button takes its name from aria-label",
    (size) => {
      render(<Button size={size} aria-label="Close" />);
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    },
  );

  it("an icon-only button without a name is a type error", () => {
    // tsc runs over this file: the directive fails the typecheck if the
    // union stops requiring aria-label / aria-labelledby.
    // @ts-expect-error icon size needs an accessible name
    render(<Button size="icon" />);
    // @ts-expect-error icon-sm size needs an accessible name
    render(<Button size="icon-sm" />);
    render(<Button size="icon" aria-labelledby="x" />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});
