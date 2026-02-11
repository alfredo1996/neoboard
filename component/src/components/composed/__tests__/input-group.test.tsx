import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InputGroup } from "../input-group";

describe("InputGroup", () => {
  it("renders a basic input when no addons", () => {
    render(<InputGroup placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("renders prefix text addon", () => {
    render(<InputGroup prefix="https://" placeholder="domain" />);
    expect(screen.getByText("https://")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("domain")).toBeInTheDocument();
  });

  it("renders suffix text addon", () => {
    render(<InputGroup suffix=".com" placeholder="domain" />);
    expect(screen.getByText(".com")).toBeInTheDocument();
  });

  it("renders prefix and suffix together", () => {
    render(<InputGroup prefix="$" suffix="USD" placeholder="amount" />);
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();
  });

  it("renders prefix icon", () => {
    render(
      <InputGroup
        prefixIcon={<span data-testid="search-icon">S</span>}
        placeholder="Search"
      />
    );
    expect(screen.getByTestId("search-icon")).toBeInTheDocument();
  });

  it("renders suffix icon", () => {
    render(
      <InputGroup
        suffixIcon={<span data-testid="check-icon">C</span>}
        placeholder="Input"
      />
    );
    expect(screen.getByTestId("check-icon")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(<InputGroup prefix="$" placeholder="amount" disabled />);
    expect(screen.getByPlaceholderText("amount")).toBeDisabled();
  });

  it("applies custom className", () => {
    const { container } = render(<InputGroup prefix="$" className="custom" />);
    expect(container.firstChild).toHaveClass("custom");
  });

  it("passes through input props", () => {
    render(<InputGroup type="email" placeholder="Email" />);
    expect(screen.getByPlaceholderText("Email")).toHaveAttribute("type", "email");
  });
});
