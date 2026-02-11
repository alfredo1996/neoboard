import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimeAgo } from "../time-ago";

describe("TimeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'just now' for dates less than 60 seconds ago", () => {
    const date = new Date("2025-06-15T11:59:30Z");
    render(<TimeAgo date={date} showTooltip={false} />);
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("shows minutes ago", () => {
    const date = new Date("2025-06-15T11:55:00Z");
    render(<TimeAgo date={date} showTooltip={false} />);
    expect(screen.getByText("5m ago")).toBeInTheDocument();
  });

  it("shows hours ago", () => {
    const date = new Date("2025-06-15T09:00:00Z");
    render(<TimeAgo date={date} showTooltip={false} />);
    expect(screen.getByText("3h ago")).toBeInTheDocument();
  });

  it("shows days ago", () => {
    const date = new Date("2025-06-13T12:00:00Z");
    render(<TimeAgo date={date} showTooltip={false} />);
    expect(screen.getByText("2d ago")).toBeInTheDocument();
  });

  it("shows weeks ago", () => {
    const date = new Date("2025-06-01T12:00:00Z");
    render(<TimeAgo date={date} showTooltip={false} />);
    expect(screen.getByText("2w ago")).toBeInTheDocument();
  });

  it("shows months ago", () => {
    const date = new Date("2025-03-15T12:00:00Z");
    render(<TimeAgo date={date} showTooltip={false} />);
    expect(screen.getByText("3mo ago")).toBeInTheDocument();
  });

  it("shows years ago", () => {
    const date = new Date("2023-06-15T12:00:00Z");
    render(<TimeAgo date={date} showTooltip={false} />);
    expect(screen.getByText("2y ago")).toBeInTheDocument();
  });

  it("renders a <time> element with correct datetime attribute", () => {
    const date = new Date("2025-06-15T11:55:00Z");
    render(<TimeAgo date={date} showTooltip={false} />);
    const timeEl = screen.getByText("5m ago");
    expect(timeEl.tagName).toBe("TIME");
    expect(timeEl).toHaveAttribute("datetime", date.toISOString());
  });

  it("accepts string dates", () => {
    render(<TimeAgo date="2025-06-15T11:55:00Z" showTooltip={false} />);
    expect(screen.getByText("5m ago")).toBeInTheDocument();
  });

  it("accepts numeric timestamps", () => {
    const date = new Date("2025-06-15T11:55:00Z");
    render(<TimeAgo date={date.getTime()} showTooltip={false} />);
    expect(screen.getByText("5m ago")).toBeInTheDocument();
  });

  it("updates the displayed time after interval", () => {
    const date = new Date("2025-06-15T11:55:00Z");
    render(<TimeAgo date={date} showTooltip={false} />);
    expect(screen.getByText("5m ago")).toBeInTheDocument();

    // Advance 5 minutes (triggers 5 interval ticks, Date.now advances to 12:05:00)
    act(() => {
      vi.advanceTimersByTime(5 * 60000);
    });

    expect(screen.getByText("10m ago")).toBeInTheDocument();
  });

  it("renders with tooltip by default", () => {
    const date = new Date("2025-06-15T11:55:00Z");
    render(<TimeAgo date={date} />);
    // When showTooltip=true (default), the time is wrapped in a Tooltip
    expect(screen.getByText("5m ago")).toBeInTheDocument();
  });
});
