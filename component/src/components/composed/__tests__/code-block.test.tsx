import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodeBlock } from "../code-block";

const writeTextMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeTextMock.mockClear().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });
});

describe("CodeBlock", () => {
  it("renders code content", () => {
    render(<CodeBlock code="const x = 1;" />);
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });

  it("renders language badge when provided", () => {
    render(<CodeBlock code="const x = 1;" language="typescript" />);
    expect(screen.getByText("typescript")).toBeInTheDocument();
  });

  it("renders copy button by default", () => {
    render(<CodeBlock code="const x = 1;" />);
    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
  });

  it("hides copy button when showCopyButton is false", () => {
    render(<CodeBlock code="const x = 1;" showCopyButton={false} />);
    expect(screen.queryByRole("button", { name: "Copy code" })).not.toBeInTheDocument();
  });

  it("copies code to clipboard on copy button click", async () => {
    render(<CodeBlock code="const x = 1;" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("const x = 1;");
    });
  });

  it("shows Copied state after clicking copy", async () => {
    render(<CodeBlock code="const x = 1;" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    });
  });

  it("reverts to Copy state after 2 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<CodeBlock code="const x = 1;" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders line numbers when showLineNumbers is true", () => {
    render(<CodeBlock code={"line1\nline2\nline3"} showLineNumbers />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not render line numbers by default", () => {
    const { container } = render(<CodeBlock code={"line1\nline2"} />);
    expect(container.querySelector("table")).not.toBeInTheDocument();
  });
});
