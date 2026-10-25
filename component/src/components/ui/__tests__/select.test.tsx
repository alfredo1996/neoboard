import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select";

describe("SelectContent", () => {
  it("floats on the one overlay shadow and the menus' radius (#2223)", () => {
    render(
      <Select open value="a">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent data-testid="content">
          <SelectItem value="a">Alpha</SelectItem>
        </SelectContent>
      </Select>,
    );
    const content = screen.getByTestId("content");
    expect(content.className).toContain("shadow-overlay");
    expect(content.className).toContain("rounded-md");
    expect(content.className).not.toContain("shadow-lg");
  });
});
