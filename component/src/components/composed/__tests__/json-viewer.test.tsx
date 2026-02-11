import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { JsonViewer } from "../json-viewer";

describe("JsonViewer", () => {
  it("renders string values with quotes", () => {
    render(<JsonViewer data={{ name: "Alice" }} initialExpanded={true} />);
    expect(screen.getByText('"Alice"')).toBeInTheDocument();
  });

  it("renders number values", () => {
    render(<JsonViewer data={{ age: 30 }} initialExpanded={true} />);
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("renders boolean values", () => {
    render(<JsonViewer data={{ active: true }} initialExpanded={true} />);
    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("renders null values", () => {
    render(<JsonViewer data={{ value: null }} initialExpanded={true} />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("renders object keys", () => {
    render(<JsonViewer data={{ name: "test" }} initialExpanded={true} />);
    expect(screen.getByText(/name:/)).toBeInTheDocument();
  });

  it("renders empty objects", () => {
    render(<JsonViewer data={{ empty: {} }} initialExpanded={true} />);
    expect(screen.getByText("{}")).toBeInTheDocument();
  });

  it("renders empty arrays", () => {
    render(<JsonViewer data={{ list: [] }} initialExpanded={true} />);
    expect(screen.getByText("[]")).toBeInTheDocument();
  });

  it("collapses nested objects at depth > initialExpanded", () => {
    render(
      <JsonViewer
        data={{ nested: { deep: "value" } }}
        initialExpanded={1}
      />
    );
    // The root is expanded (depth 0 < 1), but "nested" (depth 1) is collapsed
    expect(screen.getByText(/nested:/)).toBeInTheDocument();
    // "deep" should not be visible since it's behind a collapsed node
    expect(screen.queryByText(/deep:/)).not.toBeInTheDocument();
  });

  it("expands all levels when initialExpanded is true", () => {
    render(
      <JsonViewer
        data={{ nested: { deep: "value" } }}
        initialExpanded={true}
      />
    );
    expect(screen.getByText(/deep:/)).toBeInTheDocument();
    expect(screen.getByText('"value"')).toBeInTheDocument();
  });

  it("collapses everything when initialExpanded is 0", () => {
    render(
      <JsonViewer
        data={{ name: "Alice", age: 30 }}
        initialExpanded={0}
      />
    );
    // Root object is collapsed, shows item count
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.queryByText(/name:/)).not.toBeInTheDocument();
  });

  it("shows item count for collapsed objects", () => {
    render(
      <JsonViewer
        data={{ a: 1, b: 2, c: 3 }}
        initialExpanded={0}
      />
    );
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("shows '1 item' for single-entry collapsed objects", () => {
    render(
      <JsonViewer
        data={{ a: 1 }}
        initialExpanded={0}
      />
    );
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("toggles expansion when clicking a node", async () => {
    const user = userEvent.setup();
    render(
      <JsonViewer
        data={{ name: "Alice", age: 30 }}
        initialExpanded={0}
      />
    );

    // Initially collapsed
    expect(screen.queryByText(/name:/)).not.toBeInTheDocument();

    // Click to expand
    const collapsedNode = screen.getByText("2 items");
    await user.click(collapsedNode.closest("[class*='cursor-pointer']")!);

    expect(screen.getByText(/name:/)).toBeInTheDocument();
    expect(screen.getByText('"Alice"')).toBeInTheDocument();
  });

  it("renders arrays correctly", () => {
    render(<JsonViewer data={[1, 2, 3]} initialExpanded={true} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not show keys for array items", () => {
    render(<JsonViewer data={["hello"]} initialExpanded={true} />);
    // Array items should not have key names like "0:"
    expect(screen.queryByText(/0:/)).not.toBeInTheDocument();
    expect(screen.getByText('"hello"')).toBeInTheDocument();
  });
});
