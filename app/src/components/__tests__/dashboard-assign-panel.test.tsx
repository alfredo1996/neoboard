import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { DashboardShareItem } from "@/hooks/use-dashboards";

let mockShares: DashboardShareItem[] = [];

vi.mock("@/hooks/use-dashboards", () => ({
  useDashboardShares: () => ({ data: mockShares, isLoading: false }),
  useAssignDashboard: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRemoveDashboardShare: () => ({ mutate: vi.fn() }),
}));

vi.mock("@neoboard/components", () => ({
  Button: ({
    children,
    ...p
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...p}>{children}</button>
  ),
  Input: (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} />,
  Label: ({
    children,
    ...p
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <label {...p}>{children}</label>
  ),
  Select: ({ children, value }: React.PropsWithChildren<{ value: string }>) => (
    <div data-testid="role-select" data-value={value}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
  SelectItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
  SelectTrigger: ({
    children,
    ...p
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...p}>{children}</div>
  ),
  SelectValue: () => null,
  Alert: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  AlertDescription: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  LoadingButton: ({
    children,
    ...p
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...p}>{children}</button>
  ),
  Switch: (p: Record<string, unknown>) => <input type="checkbox" {...p} />,
  Separator: () => <hr />,
}));

vi.mock("lucide-react", () => ({
  UserPlus: () => <span />,
  Trash2: () => <span />,
}));

import { DashboardAssignPanel } from "../dashboard-assign-panel";

function makeShare(over: Partial<DashboardShareItem>): DashboardShareItem {
  return {
    id: "s1",
    role: "editor",
    createdAt: "2026-01-01",
    userName: "Carol",
    userEmail: "carol@example.com",
    userRole: "reader",
    ...over,
  };
}

const props = { dashboardId: "d1", isPublic: false, onTogglePublic: vi.fn() };

describe("DashboardAssignPanel — editor-for-reader annotation (#1056)", () => {
  it("annotates that an Editor share is a no-op for a reader-role user", () => {
    mockShares = [makeShare({ role: "editor", userRole: "reader" })];
    render(<DashboardAssignPanel {...props} />);
    expect(screen.getByText(/Editor has no effect/i)).toBeInTheDocument();
  });

  it("does not annotate an Editor share for a creator", () => {
    mockShares = [makeShare({ role: "editor", userRole: "creator" })];
    render(<DashboardAssignPanel {...props} />);
    expect(screen.queryByText(/Editor has no effect/i)).not.toBeInTheDocument();
  });

  it("does not annotate a Viewer share for a reader", () => {
    mockShares = [makeShare({ role: "viewer", userRole: "reader" })];
    render(<DashboardAssignPanel {...props} />);
    expect(screen.queryByText(/Editor has no effect/i)).not.toBeInTheDocument();
  });
});
