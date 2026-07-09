import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CopyButton } from "../copy-button";

describe("CopyButton", () => {
  it("renders with default label", () => {
    render(<CopyButton value="hello" />);
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("renders with custom label", () => {
    render(<CopyButton value="hello" label="Copy password" />);
    expect(
      screen.getByRole("button", { name: /copy password/i }),
    ).toBeInTheDocument();
  });

  it("calls clipboard API and shows Copied! on click", async () => {
    const user = userEvent.setup();
    render(<CopyButton value="secret-value" />);
    await user.click(screen.getByRole("button", { name: /copy/i }));
    // "Copied!" only appears after await navigator.clipboard.writeText resolves
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
  });

  it('reverts to "Copy" after timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<CopyButton value="test" />);
    await user.click(screen.getByRole("button", { name: /copy/i }));

    // Wait for the async clipboard write to resolve and "Copied!" to appear
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("applies custom className", () => {
    render(<CopyButton value="test" className="custom-class" />);
    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  it("clears the pending reset timer when copied twice in a row", async () => {
    const user = userEvent.setup();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    render(<CopyButton value="x" />);
    const btn = screen.getByRole("button", { name: /copy/i });

    await user.click(btn);
    await waitFor(() =>
      expect(screen.getByText("Copied!")).toBeInTheDocument(),
    );

    // Second copy while the first reset is still pending exercises the
    // `if (timeoutRef.current) clearTimeout(...)` branch.
    await user.click(btn);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("does not flash 'Copied!' when the clipboard write fails (#component-review)", async () => {
    const user = userEvent.setup();
    const writeSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new Error("Document is not focused"));

    render(<CopyButton value="secret" />);
    await user.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeSpy).toHaveBeenCalledWith("secret");
    // The rejection is swallowed and the button stays "Copy" — no false success.
    await waitFor(() => {
      expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
    });
    writeSpy.mockRestore();
  });
});
