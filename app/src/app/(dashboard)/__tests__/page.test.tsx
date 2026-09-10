import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { DashboardListItem } from "@/hooks/use-dashboards";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockDashboards: DashboardListItem[] = [];

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "creator" } } }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-dashboards", () => ({
  useDashboards: () => ({ data: mockDashboards, isLoading: false }),
  useCreateDashboard: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDashboard: () => ({ mutate: vi.fn(), isPending: false }),
  useDuplicateDashboard: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateDashboard: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportDashboard: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-connections", () => ({
  useConnections: () => ({ data: [] }),
}));

vi.mock("@/components/dashboard-connection-dialog", () => ({
  DashboardConnectionDialog: () => null,
}));

vi.mock("@neoboard/components", () => {
  type Props = { children?: React.ReactNode; [key: string]: unknown };
  const pass = (Tag: "div" | "span" | "label" = "div") => {
    const C = ({ children, ...rest }: Props) => (
      <Tag data-testid={rest["data-testid"] as string | undefined}>
        {children}
      </Tag>
    );
    return C;
  };
  const Button = ({ children, onClick, ...rest }: Props) => (
    <button
      type={(rest.type as "button" | "submit") ?? "button"}
      onClick={onClick as React.MouseEventHandler}
    >
      {children}
    </button>
  );
  const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  );
  return {
    Alert: pass(),
    AlertDescription: pass(),
    Button,
    LoadingButton: Button,
    Input,
    Badge: pass("span"),
    Card: ({ children, onClick, ...rest }: Props) => (
      <div
        data-testid={rest["data-testid"] as string | undefined}
        onClick={onClick as React.MouseEventHandler}
      >
        {children}
      </div>
    ),
    CardHeader: pass(),
    CardTitle: pass(),
    CardDescription: pass(),
    CardFooter: pass(),
    Checkbox: () => <input type="checkbox" />,
    Dialog: ({ open, children }: Props) =>
      open ? <div role="dialog">{children}</div> : null,
    DialogContent: pass(),
    DialogHeader: pass(),
    DialogTitle: pass(),
    DialogDescription: pass(),
    DialogFooter: pass(),
    Label: ({ children, htmlFor }: Props) => (
      <label htmlFor={htmlFor as string}>{children}</label>
    ),
    DropdownMenu: pass(),
    DropdownMenuContent: pass(),
    DropdownMenuItem: Button,
    DropdownMenuSeparator: () => null,
    DropdownMenuTrigger: pass(),
    // Native <select> stand-in for the Radix Select so a change event drives
    // onValueChange the way a real pick does.
    Select: ({ value, onValueChange, children }: Props) => (
      <select
        aria-label="Filter by tag"
        value={value as string}
        onChange={(e) => (onValueChange as (v: string) => void)(e.target.value)}
      >
        {children}
      </select>
    ),
    SelectContent: ({ children }: Props) => <>{children}</>,
    SelectItem: ({ value, children }: Props) => (
      <option value={value as string}>{children}</option>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    PageHeader: ({ title, actions }: Props) => (
      <div>
        <h1>{title as string}</h1>
        {actions as React.ReactNode}
      </div>
    ),
    EmptyState: ({ title }: Props) => <div>{title as string}</div>,
    LoadingOverlay: pass(),
    ConfirmDialog: () => null,
    TimeAgo: () => <span />,
    useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  };
});

import DashboardListPage from "../page";

function item(id: string, name: string, tags: string[]): DashboardListItem {
  return {
    id,
    name,
    description: null,
    tags,
    isPublic: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedByName: null,
    role: "owner",
    widgetCount: 0,
  };
}

const cards = () => screen.queryAllByTestId("dashboard-card");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DashboardListPage — tags (#1692)", () => {
  beforeEach(() => {
    mockDashboards = [
      item("d1", "Sales Overview", ["sales", "kpi"]),
      item("d2", "Ops Board", ["ops"]),
      item("d3", "Plain", []),
    ];
  });

  it("renders each dashboard's tags as chips", () => {
    render(<DashboardListPage />);
    expect(cards()).toHaveLength(3);
    const sales = cards()[0];
    expect(sales).toHaveTextContent("sales");
    expect(sales).toHaveTextContent("kpi");
  });

  it("narrows the list to dashboards carrying the selected tag", () => {
    render(<DashboardListPage />);
    fireEvent.change(screen.getByLabelText("Filter by tag"), {
      target: { value: "sales" },
    });
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toHaveTextContent("Sales Overview");
  });

  it("combines the tag filter with the name search", () => {
    render(<DashboardListPage />);
    fireEvent.change(screen.getByLabelText("Filter by tag"), {
      target: { value: "sales" },
    });
    fireEvent.change(screen.getByLabelText("Search dashboards"), {
      target: { value: "zzz" },
    });
    expect(cards()).toHaveLength(0);
    expect(screen.getByText(/No dashboards match “zzz”/)).toBeInTheDocument();
  });

  it("hides the tag filter when no dashboard has tags", () => {
    mockDashboards = [item("d1", "Plain", [])];
    render(<DashboardListPage />);
    expect(screen.queryByLabelText("Filter by tag")).not.toBeInTheDocument();
  });

  it("drops a selected tag that no longer exists after a refetch", () => {
    const { rerender } = render(<DashboardListPage />);
    fireEvent.change(screen.getByLabelText("Filter by tag"), {
      target: { value: "ops" },
    });
    expect(cards()).toHaveLength(1);
    mockDashboards = [
      item("d1", "Sales Overview", ["sales"]),
      item("d2", "Ops Board", []),
    ];
    rerender(<DashboardListPage />);
    expect(cards()).toHaveLength(2);
  });

  it("offers a Tags field in the create dialog", () => {
    render(<DashboardListPage />);
    fireEvent.click(screen.getByRole("button", { name: /New Dashboard/ }));
    expect(screen.getByLabelText(/^Tags/)).toBeInTheDocument();
  });
});
