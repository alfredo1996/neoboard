import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { CodePreview } from "../code-preview";

describe("CodePreview", () => {
  it("renders the code text", () => {
    render(<CodePreview value="MATCH (n) RETURN n" />);
    expect(screen.getByTestId("code-preview")).toHaveTextContent("MATCH (n) RETURN n");
  });

  it('shows "No query" when value is empty', () => {
    render(<CodePreview value="" />);
    expect(screen.getByTestId("code-preview")).toHaveTextContent("No query");
  });

  it("shows language label when provided", () => {
    render(<CodePreview value="SELECT 1" language="SQL" />);
    expect(screen.getByText("SQL")).toBeInTheDocument();
  });

  it("truncates text beyond maxLines and shows More button", () => {
    const multiline = "line1\nline2\nline3\nline4\nline5";
    render(<CodePreview value={multiline} maxLines={3} />);
    // Should show truncation indicator
    expect(screen.getByTestId("code-preview")).toHaveTextContent("…");
    expect(screen.getByText("More")).toBeInTheDocument();
  });

  it("does not truncate when lines are within maxLines", () => {
    render(<CodePreview value="line1\nline2" maxLines={3} />);
    expect(screen.queryByText("More")).not.toBeInTheDocument();
  });

  it("expands text when More is clicked", async () => {
    const user = userEvent.setup();
    const multiline = "line1\nline2\nline3\nline4\nline5";
    render(<CodePreview value={multiline} maxLines={3} />);

    await user.click(screen.getByText("More"));
    expect(screen.getByText("Less")).toBeInTheDocument();
    expect(screen.getByTestId("code-preview")).toHaveTextContent("line5");
  });

  it("does not truncate when maxLines is 0", () => {
    const multiline = "line1\nline2\nline3\nline4\nline5";
    render(<CodePreview value={multiline} maxLines={0} />);
    expect(screen.queryByText("More")).not.toBeInTheDocument();
    expect(screen.getByTestId("code-preview")).toHaveTextContent("line5");
  });
});
