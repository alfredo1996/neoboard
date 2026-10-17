import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

/* ---------- mocks ---------- */

const mockPush = vi.fn();
const mockSignOut = vi.fn();
const mockUseSession = vi.fn();
const mockSetTheme = vi.fn();

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
    setTheme: (...args: unknown[]) => mockSetTheme(...args),
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
  // The kit sidebar's contract: groups of items, and an account with callbacks.
  Sidebar: ({
    groups,
    account,
  }: {
    groups: {
      label: string;
      showLabel?: boolean;
      items: { label: string; active?: boolean; onSelect: () => void }[];
    }[];
    account?: {
      name: string;
      detail?: string;
      onProfile: () => void;
      onSignOut: () => void;
      theme?: { value: string; onChange: (v: string) => void };
    };
  }) => (
    <nav data-testid="sidebar">
      {groups.map((g) => (
        <div key={g.label} data-testid={`group-${g.label}`}>
          {g.items.map((i) => (
            <button
              key={i.label}
              data-testid={`sidebar-item-${i.label}`}
              data-active={i.active ? "true" : "false"}
              onClick={i.onSelect}
            >
              {i.label}
            </button>
          ))}
        </div>
      ))}
      {account && (
        <div data-testid="account">
          <span>{account.name}</span>
          <span data-testid="account-detail">{account.detail}</span>
          <button data-testid="account-profile" onClick={account.onProfile} />
          <button data-testid="account-signout" onClick={account.onSignOut} />
          <button
            data-testid="account-theme"
            data-value={account.theme?.value}
            onClick={() => account.theme?.onChange("dark")}
          />
        </div>
      )}
    </nav>
  ),
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
    expect(container.querySelector(".animate-spin")).toBeTruthy();
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

  it("shows the user's name and role in the account button", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Bob", role: "creator" } },
      status: "authenticated",
    });
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );
    expect(screen.getByText("Bob")).toBeDefined();
    expect(screen.getByTestId("account-detail").textContent).toBe("creator");
  });

  it("keeps Sign out and Theme reachable when the session has no name", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "" } },
      status: "authenticated",
    });
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );
    expect(screen.getByTestId("account").textContent).toContain("Account");
    expect(screen.getByTestId("account-signout")).toBeDefined();
  });

  it("lists the workspace items for everyone and Users only for an admin", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Admin", role: "admin" } },
      status: "authenticated",
    });
    const { unmount } = render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );
    expect(screen.getByTestId("group-Workspace").textContent).toBe(
      "DashboardsConnectionsWidget LibrarySettings",
    );
    expect(screen.getByTestId("group-Admin").textContent).toBe("Users");
    expect(screen.getByTestId("sidebar-item-Dashboards").dataset.active).toBe(
      "true",
    );
    unmount();

    mockUseSession.mockReturnValue({
      data: { user: { name: "Bob", role: "creator" } },
      status: "authenticated",
    });
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );
    expect(screen.queryByTestId("group-Admin")).toBeNull();
  });

  it("routes each item, and Profile opens the profile page", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Admin", role: "admin" } },
      status: "authenticated",
    });
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );
    fireEvent.click(screen.getByTestId("sidebar-item-Connections"));
    expect(mockPush).toHaveBeenLastCalledWith("/connections");
    fireEvent.click(screen.getByTestId("sidebar-item-Settings"));
    expect(mockPush).toHaveBeenLastCalledWith("/settings/profile");
    fireEvent.click(screen.getByTestId("account-profile"));
    expect(mockPush).toHaveBeenLastCalledWith("/settings/profile");
  });

  it("signs out to a clean /login with no callbackUrl (#1037)", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Admin", role: "admin" } },
      status: "authenticated",
    });
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );
    fireEvent.click(screen.getByTestId("account-signout"));
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("passes the theme preference through and applies a choice", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Admin", role: "admin" } },
      status: "authenticated",
    });
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>,
    );
    expect(screen.getByTestId("account-theme").dataset.value).toBe("system");
    fireEvent.click(screen.getByTestId("account-theme"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
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
