import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "../badge";

describe("Badge", () => {
  it("renders a count", () => {
    render(<Badge>12</Badge>);
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});
