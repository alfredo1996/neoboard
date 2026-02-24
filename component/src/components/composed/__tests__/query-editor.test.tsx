import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryEditor } from "../query-editor";

describe("QueryEditor", () => {
  it("renders textarea with placeholder", () => {
    render(<QueryEditor />);
    expect(screen.getByPlaceholderText("Enter your query...")).toBeInTheDocument();
  });

  it("renders custom placeholder", () => {
    render(<QueryEditor placeholder="Write Cypher..." />);
    expect(screen.getByPlaceholderText("Write Cypher...")).toBeInTheDocument();
  });

  it("renders language label", () => {
    render(<QueryEditor language="SQL" />);
    expect(screen.getByText("SQL")).toBeInTheDocument();
  });

  it("shows default Cypher language", () => {
    render(<QueryEditor />);
    expect(screen.getByText("Cypher")).toBeInTheDocument();
  });

  it("renders run button", () => {
    render(<QueryEditor />);
    expect(screen.getByText("Run")).toBeInTheDocument();
  });

  it("shows running state", () => {
    render(<QueryEditor running value="MATCH (n) RETURN n" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("calls onRun when run button is clicked", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(<QueryEditor defaultValue="MATCH (n) RETURN n" onRun={onRun} />);
    await user.click(screen.getByText("Run"));
    expect(onRun).toHaveBeenCalledWith("MATCH (n) RETURN n");
  });

  it("calls onChange when text is typed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<QueryEditor onChange={onChange} />);
    await user.type(screen.getByPlaceholderText("Enter your query..."), "MATCH");
    expect(onChange).toHaveBeenCalled();
  });

  it("disables run when query is empty", () => {
    render(<QueryEditor value="" />);
    expect(screen.getByText("Run").closest("button")).toBeDisabled();
  });

  it("disables run when running", () => {
    render(<QueryEditor value="MATCH (n)" running />);
    expect(screen.getByText("Running").closest("button")).toBeDisabled();
  });

  it("renders clear button", () => {
    render(<QueryEditor defaultValue="MATCH (n)" />);
    expect(screen.getByLabelText("Clear query")).toBeInTheDocument();
  });

  it("clears query on clear button click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<QueryEditor defaultValue="MATCH (n)" onChange={onChange} />);
    await user.click(screen.getByLabelText("Clear query"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("applies custom className", () => {
    const { container } = render(<QueryEditor className="my-editor" />);
    expect(container.firstChild).toHaveClass("my-editor");
  });

  // CMD+Enter / Ctrl+Enter should NOT call onRun when Shift is also held down — the
  // run-and-save shortcut (CMD+Shift+Enter) is handled at the modal level and must not
  // be intercepted by the textarea's keydown handler.
  it("does NOT call onRun on CMD+Shift+Enter (reserved for run-and-save)", () => {
    const onRun = vi.fn();
    render(<QueryEditor defaultValue="MATCH (n) RETURN n" onRun={onRun} />);
    const textarea = screen.getByPlaceholderText("Enter your query...");
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true, shiftKey: true });
    expect(onRun).not.toHaveBeenCalled();
  });

  it("does NOT call onRun on Ctrl+Shift+Enter (reserved for run-and-save)", () => {
    const onRun = vi.fn();
    render(<QueryEditor defaultValue="MATCH (n) RETURN n" onRun={onRun} />);
    const textarea = screen.getByPlaceholderText("Enter your query...");
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true, shiftKey: true });
    expect(onRun).not.toHaveBeenCalled();
  });

  it("DOES call onRun on CMD+Enter without Shift", () => {
    const onRun = vi.fn();
    render(<QueryEditor defaultValue="MATCH (n) RETURN n" onRun={onRun} />);
    const textarea = screen.getByPlaceholderText("Enter your query...");
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true, shiftKey: false });
    expect(onRun).toHaveBeenCalledWith("MATCH (n) RETURN n");
  });

  it("does not render the run-and-save hint by default", () => {
    render(<QueryEditor />);
    expect(screen.queryByLabelText(/run and save shortcut/i)).toBeNull();
  });

  it("renders the run-and-save hint when runAndSaveHint=true", () => {
    render(<QueryEditor runAndSaveHint />);
    expect(
      screen.getByLabelText("Run and save shortcut: Command Shift Enter")
    ).toBeInTheDocument();
  });
});
