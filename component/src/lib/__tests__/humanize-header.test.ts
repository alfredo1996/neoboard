import { describe, it, expect } from "vitest";
import { humanizeHeader } from "../humanize-header";

describe("humanizeHeader (#1055)", () => {
  it("spaces and capitalizes snake_case", () => {
    expect(humanizeHeader("Total_spend")).toBe("Total Spend");
    expect(humanizeHeader("total_spend")).toBe("Total Spend");
  });

  it("capitalizes a single word", () => {
    expect(humanizeHeader("customer")).toBe("Customer");
    expect(humanizeHeader("City")).toBe("City");
  });

  it("collapses repeated separators", () => {
    expect(humanizeHeader("first__name")).toBe("First Name");
    expect(humanizeHeader("a b")).toBe("A B");
  });
});
