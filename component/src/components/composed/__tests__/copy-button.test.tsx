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
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("Copy")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("applies custom className", () => {
    render(<CopyButton value="test" className="custom-class" />);
    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });
});
