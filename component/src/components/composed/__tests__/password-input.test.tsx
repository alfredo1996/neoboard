import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PasswordInput } from "../password-input";

describe("PasswordInput", () => {
  it("renders as password input by default", () => {
    render(<PasswordInput placeholder="Enter password" />);
    expect(screen.getByPlaceholderText("Enter password")).toHaveAttribute("type", "password");
  });

  it("toggles to text input when visibility button is clicked", () => {
    render(<PasswordInput placeholder="Enter password" />);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByPlaceholderText("Enter password")).toHaveAttribute("type", "text");
  });

  it("toggles back to password after second click", () => {
    render(<PasswordInput placeholder="Enter password" />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByPlaceholderText("Enter password")).toHaveAttribute("type", "password");
  });

  it("starts as text input when showPasswordByDefault is true", () => {
    render(<PasswordInput showPasswordByDefault placeholder="Enter password" />);
    expect(screen.getByPlaceholderText("Enter password")).toHaveAttribute("type", "text");
  });

  it("shows 'Show password' label when hidden", () => {
    render(<PasswordInput />);
    expect(screen.getByText("Show password")).toBeInTheDocument();
  });

  it("shows 'Hide password' label when visible", () => {
    render(<PasswordInput showPasswordByDefault />);
    expect(screen.getByText("Hide password")).toBeInTheDocument();
  });
});
