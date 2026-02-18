import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChartContextMenu } from "../chart-context-menu";

describe("ChartContextMenu", () => {
  const groups = [
    {
      items: [
        { label: "Drill Down", onClick: vi.fn() },
        { label: "Filter", onClick: vi.fn() },
      ],
    },
    {
      items: [
        { label: "Delete", onClick: vi.fn(), destructive: true },
      ],
    },
  ];

  it("renders children", () => {
    render(
      <ChartContextMenu groups={groups}>
        <div>Chart Area</div>
      </ChartContextMenu>
    );
    expect(screen.getByText("Chart Area")).toBeInTheDocument();
  });

  it("shows menu items on context menu trigger", () => {
    render(
      <ChartContextMenu groups={groups}>
        <div>Chart Area</div>
      </ChartContextMenu>
    );
    fireEvent.contextMenu(screen.getByText("Chart Area"));
    expect(screen.getByText("Drill Down")).toBeInTheDocument();
    expect(screen.getByText("Filter")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("renders items with icons", () => {
    const withIcon = [
      {
        items: [
          { label: "Action", onClick: vi.fn(), icon: <span data-testid="icon">I</span> },
        ],
      },
    ];
    render(
      <ChartContextMenu groups={withIcon}>
        <div>Chart</div>
      </ChartContextMenu>
    );
    fireEvent.contextMenu(screen.getByText("Chart"));
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ChartContextMenu groups={groups} className="custom-ctx">
        <div>Chart</div>
      </ChartContextMenu>
    );
    expect(container.querySelector(".custom-ctx")).toBeInTheDocument();
  });

  it("renders all items from multiple groups", () => {
    render(
      <ChartContextMenu groups={groups}>
        <div>Chart</div>
      </ChartContextMenu>
    );
    fireEvent.contextMenu(screen.getByText("Chart"));
    expect(screen.getByText("Drill Down")).toBeInTheDocument();
    expect(screen.getByText("Filter")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });
});
