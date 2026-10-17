import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { Sidebar, SIDEBAR_COLLAPSED_KEY, type SidebarProps } from "../sidebar";
import { AppShell } from "../app-shell";
import { PRODUCT_NAME } from "../product";

const groups: SidebarProps["groups"] = [
  {
    label: "Workspace",
    items: [
      {
        id: "d",
        label: "Dashboards",
        icon: <i />,
        active: true,
        onSelect: vi.fn(),
      },
      { id: "c", label: "Connections", icon: <i />, onSelect: vi.fn() },
    ],
  },
  {
    label: "Admin",
    showLabel: true,
    items: [{ id: "u", label: "Users", icon: <i />, onSelect: vi.fn() }],
  },
];

const account: SidebarProps["account"] = {
  name: "Alice Demo",
  detail: "Admin",
  onProfile: vi.fn(),
  onSignOut: vi.fn(),
  theme: {
    value: "system",
    options: [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
      { value: "system", label: "System" },
    ],
    onChange: vi.fn(),
  },
};

function mockWidth(narrow: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: narrow && q.includes("max-width"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockWidth(false);
});

describe("Sidebar", () => {
  it("exposes nav and main landmarks inside the shell", () => {
    render(
      <AppShell sidebar={<Sidebar groups={groups} account={account} />}>
        page
      </AppShell>,
    );
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
    expect(screen.getByRole("main")).toHaveTextContent("page");
    expect(
      screen.getByRole("navigation", { name: "Admin" }),
    ).toBeInTheDocument();
  });

  it("marks the active item and shows only the Admin group label", () => {
    render(<Sidebar groups={groups} />);
    expect(screen.getByRole("button", { name: "Dashboards" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Connections" }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.getByText(PRODUCT_NAME)).toBeInTheDocument();
  });

  it("calls onSelect when an item is chosen", () => {
    render(<Sidebar groups={groups} />);
    fireEvent.click(screen.getByRole("button", { name: "Users" }));
    expect(groups[1].items[0].onSelect).toHaveBeenCalledTimes(1);
  });

  it("opens the account menu with Theme, Profile and Sign out", async () => {
    const user = userEvent.setup();
    render(<Sidebar groups={groups} account={account} />);
    await user.click(
      screen.getByRole("button", { name: "Account: Alice Demo" }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: /Theme/ }),
    ).toHaveTextContent("Theme System");
    await user.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    expect(account!.onSignOut).toHaveBeenCalledTimes(1);
  });

  it("lists the theme options in a submenu and reports the choice", async () => {
    const user = userEvent.setup();
    render(<Sidebar groups={groups} account={account} />);
    await user.click(
      screen.getByRole("button", { name: "Account: Alice Demo" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Theme/ }));
    await screen.findByRole("menuitemradio", { name: "Dark" });
    // Radix keeps the submenu out of reach of pointer events in jsdom; use keys.
    await user.keyboard("{ArrowRight}{ArrowDown}{Enter}");
    expect(account!.theme!.onChange).toHaveBeenCalledWith("dark");
  });

  it("shows the account avatar as a round chip with a fill that reads", () => {
    render(<Sidebar groups={groups} account={account} />);
    const avatar = screen
      .getByRole("button", { name: "Account: Alice Demo" })
      .querySelector("span[aria-hidden]")!;
    const tokens = avatar.className.split(/\s+/);
    expect(tokens).toEqual(
      expect.arrayContaining([
        "rounded-full",
        "justify-center",
        "bg-card-edge",
      ]),
    );
    expect(tokens).not.toContain("bg-secondary");
  });

  it("keeps the account detail line at 4.5:1 on the active fill", () => {
    render(<Sidebar groups={groups} account={account} />);
    const detail = screen.getByText("Admin", { selector: "small" });
    expect(detail.className).toContain("text-foreground-2");
  });

  it("does not animate the width on first paint, only after a toggle", () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");
    render(<Sidebar groups={groups} />);
    const aside = screen.getByRole("complementary", { name: "Sidebar" });
    expect(aside.className).not.toContain("transition-[width]");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(aside.className).toContain("transition-[width]");
  });

  it("takes its starting state from defaultCollapsed over storage", () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");
    render(<Sidebar groups={groups} defaultCollapsed={false} />);
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();
  });

  it("starts expanded when reading storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Sidebar groups={groups} />);
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  describe("rail", () => {
    it("names every rail item and keeps the account menu reachable", async () => {
      const user = userEvent.setup();
      mockWidth(true);
      render(<Sidebar groups={groups} account={account} />);
      for (const name of ["Dashboards", "Connections", "Users"]) {
        expect(screen.getByRole("button", { name })).toHaveAttribute(
          "aria-label",
          name,
        );
      }
      await user.click(
        screen.getByRole("button", { name: "Account: Alice Demo" }),
      );
      expect(
        await screen.findByRole("menuitem", { name: "Sign out" }),
      ).toBeInTheDocument();
    });

    it("has no collapse toggle under 1024 px, where the rail is automatic", () => {
      mockWidth(true);
      render(<Sidebar groups={groups} />);
      expect(
        screen.queryByRole("button", { name: /sidebar/i }),
      ).not.toBeInTheDocument();
    });

    it("collapses by hand on a wide screen and remembers it", () => {
      const { unmount } = render(<Sidebar groups={groups} />);
      expect(
        screen.getByRole("button", { name: "Dashboards" }),
      ).not.toHaveAttribute("aria-label");
      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
      expect(
        screen.getByRole("button", { name: "Dashboards" }),
      ).toHaveAttribute("aria-label", "Dashboards");
      expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("true");
      unmount();

      render(<Sidebar groups={groups} />);
      expect(
        screen.getByRole("button", { name: "Expand sidebar" }),
      ).toBeInTheDocument();
    });

    it("still collapses when storage throws", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      render(<Sidebar groups={groups} />);
      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
      expect(
        screen.getByRole("button", { name: "Expand sidebar" }),
      ).toBeInTheDocument();
      vi.restoreAllMocks();
    });
  });
});
