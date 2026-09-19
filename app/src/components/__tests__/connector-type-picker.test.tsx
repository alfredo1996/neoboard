import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";

vi.mock("@neoboard/components", () => ({
  Alert: ({ children }: { children?: React.ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  AlertDescription: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Button: ({
    children,
    onClick,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
}));

import { ConnectorTypePicker } from "../connector-type-picker";

const ICON = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';

// A third connector nothing in app/ has heard of, and one with no icon.
const connectors = [
  {
    type: "acme-sheets",
    label: "Acme Sheets",
    category: "file",
    iconSvg: ICON,
  },
  { type: "acme-rest", label: "Acme REST", category: "api" },
] as const;

const idle = { isLoading: false, isError: false, onRetry: vi.fn() };

describe("ConnectorTypePicker (#1899)", () => {
  it("renders one button per connector from the data: label, category text, icon, derived test id", () => {
    render(
      <ConnectorTypePicker
        {...idle}
        connectors={[...connectors]}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);

    const sheets = screen.getByTestId("pick-acme-sheets");
    expect(within(sheets).getByText("Acme Sheets")).toBeInTheDocument();
    expect(within(sheets).getByText("File")).toBeInTheDocument();
    expect(sheets.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/svg+xml;utf8," + encodeURIComponent(ICON),
    );

    const rest = screen.getByTestId("pick-acme-rest");
    expect(within(rest).getByText("Acme REST")).toBeInTheDocument();
    expect(within(rest).getByText("API")).toBeInTheDocument();
    // No iconSvg → the generic glyph for its category, not somebody's logo.
    expect(rest.querySelector("img")).toBeNull();
    expect(rest.querySelector("svg.lucide")).not.toBeNull();
  });

  it("picks by type", () => {
    const onPick = vi.fn();
    render(
      <ConnectorTypePicker
        {...idle}
        connectors={[...connectors]}
        onPick={onPick}
      />,
    );
    fireEvent.click(screen.getByTestId("pick-acme-rest"));
    expect(onPick).toHaveBeenCalledWith("acme-rest");
  });

  it("shows skeletons while the connectors load, and nothing to pick", () => {
    render(
      <ConnectorTypePicker
        {...idle}
        isLoading
        connectors={undefined}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("on failure shows an error with a retry — never a hardcoded fallback type", () => {
    const onRetry = vi.fn();
    render(
      <ConnectorTypePicker
        isLoading={false}
        isError
        onRetry={onRetry}
        connectors={undefined}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not load the available connectors/i,
    );
    expect(screen.queryByTestId(/^pick-/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says so when no connector is installed", () => {
    render(<ConnectorTypePicker {...idle} connectors={[]} onPick={vi.fn()} />);
    expect(screen.getByText(/no connectors are installed/i)).toBeVisible();
  });
});
