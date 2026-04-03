import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

/* ---------- mocks ---------- */

const mockPush = vi.fn();
const mockSignOut = vi.fn();
const mockUseSession = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({
    preference: "system" as const,
    resolvedTheme: "light" as const,
    setTheme: vi.fn(),
  }),
}));

vi.mock("@neoboard/components", () => ({
  AppShell: ({
    children,
    sidebar,
  }: {
    children: React.ReactNode;
    sidebar: React.ReactNode;
  }) => (
    <div data-testid="app-shell">
      <div data-testid="sidebar-container">{sidebar}</div>
      <div data-testid="content">{children}</div>
    </div>
  ),
  Sidebar: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    collapsed?: boolean;
    onCollapsedChange?: (v: boolean) => void;
    header?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <nav data-testid="sidebar">
      {children}
      <div data-testid="sidebar-footer">{footer}</div>
    </nav>
  ),
  SidebarItem: ({
    label,
    icon,
    onClick,
  }: {
    label: string;
    icon?: React.ReactNode;
    active?: boolean;
    collapsed?: boolean;
    onClick?: () => void;
  }) => (
    <button data-testid={`sidebar-item-${label}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  ),
  Badge: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div>{children}</div>,
  DropdownMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
    side?: string;
    align?: string;
  }) => <div>{children}</div>,
  DropdownMenuRadioGroup: ({
    children,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => <div>{children}</div>,
  DropdownMenuRadioItem: ({
    children,
  }: {
    children: React.ReactNode;
    value?: string;
  }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

/* ---------- import under test ---------- */
import DashboardLayout from "../layout";

/* ---------- tests ---------- */

describe("DashboardLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner when session status is loading", () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });

    const { container } = render(
      <DashboardLayout>
        <div>Child content</div>
      </DashboardLayout>,
    );

    // Should show spinner, not content
    expect(container.querySelector(".animate-spin")).toBeDefined();
    expect(screen.queryByText("Child content")).toBeNull();
  });

  it("renders children and sidebar when authenticated", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Alice", role: "admin" } },
      status: "authenticated",
    });

    render(
      <DashboardLayout>
        <div>Dashboard content</div>
      </DashboardLayout>,
    );

    expect(screen.getByText("Dashboard content")).toBeDefined();
    expect(screen.getByTestId("sidebar")).toBeDefined();
  });

  it("displays user name in sidebar footer", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Alice Smith", role: "admin" } },
      status: "authenticated",
    });

    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    expect(screen.getByText("Alice Smith")).toBeDefined();
  });

  it("displays user role badge in sidebar footer", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Bob", role: "creator" } },
      status: "authenticated",
    });

    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    expect(screen.getByTestId("badge")).toBeDefined();
    expect(screen.getByText("creator")).toBeDefined();
  });

  it("does not display role badge when role is empty", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Charlie" } },
      status: "authenticated",
    });

    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    expect(screen.getByText("Charlie")).toBeDefined();
    expect(screen.queryByTestId("badge")).toBeNull();
  });

  it("does not display user identity section when name is empty", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "" } },
      status: "authenticated",
    });

    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    // The user identity section should not render when userName is falsy
    expect(screen.queryByTestId("badge")).toBeNull();
  });

  it("renders all expected sidebar navigation items", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Admin", role: "admin" } },
      status: "authenticated",
    });

    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    expect(screen.getByTestId("sidebar-item-Dashboards")).toBeDefined();
    expect(screen.getByTestId("sidebar-item-Connections")).toBeDefined();
    expect(screen.getByTestId("sidebar-item-Users")).toBeDefined();
    expect(screen.getByTestId("sidebar-item-Widget Lab")).toBeDefined();
    expect(screen.getByTestId("sidebar-item-Settings")).toBeDefined();
    expect(screen.getByTestId("sidebar-item-Sign out")).toBeDefined();
    expect(screen.getByTestId("sidebar-item-Theme")).toBeDefined();
  });

  it("calls onUnauthenticated callback to redirect to login", () => {
    mockUseSession.mockImplementation(
      ({ onUnauthenticated }: { onUnauthenticated: () => void }) => {
        onUnauthenticated();
        return { data: null, status: "loading" };
      },
    );

    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );

    expect(mockPush).toHaveBeenCalledWith("/login");
  });
});
