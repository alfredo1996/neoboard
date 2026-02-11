import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CopyButton } from "../copy-button";

const writeTextMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeTextMock.mockClear().mockResolvedValue(undefined);
  // jsdom doesn't provide navigator.clipboard - define it
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });
});

describe("CopyButton", () => {
  it("renders with Copy label", () => {
    render(<CopyButton value="test" />);
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("calls clipboard.writeText with the correct value on click", async () => {
    render(<CopyButton value="hello world" />);

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("hello world");
    });
  });

  it("shows Copied state after clicking", async () => {
    render(<CopyButton value="test" />);

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });

  it("reverts to Copy state after 2 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<CopyButton value="test" />);

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Copy")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("calls onCopy callback after copying", async () => {
    const onCopy = vi.fn();
    render(<CopyButton value="test" onCopy={onCopy} />);

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(onCopy).toHaveBeenCalledOnce();
    });
  });

  it("handles clipboard error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    writeTextMock.mockRejectedValueOnce(new Error("Permission denied"));

    render(<CopyButton value="test" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to copy:",
        expect.any(Error)
      );
    });
    expect(screen.getByText("Copy")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
