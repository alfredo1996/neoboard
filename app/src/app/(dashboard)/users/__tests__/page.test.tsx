import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import type { UserListItem } from "@/hooks/use-users";
import { MockDialogContent } from "@/__tests__/helpers/dialog-mocks";

/**
 * #2049 — an admin can disable and re-enable a user from the row menu, and a
 * disabled user carries a "Disabled" badge beside their name.
 */

const SelectContext = React.createContext<(v: string) => void>(() => {});
const ME = "admin-1";
let mockUsers: UserListItem[] = [];
let mockError: Error | null = null;
const mockSetDisabled = vi.fn();
const mockUpdateRole = vi.fn();
const mockUpdateCanWrite = vi.fn();
const mockToast = vi.fn();
const mockResetPassword = vi.fn();

function user(overrides: Partial<UserListItem>): UserListItem {
  return {
    id: "u2",
    name: "Dana",
    email: `${overrides.id ?? "u2"}@example.com`,
    role: "creator",
    canWrite: true,
    disabledAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: ME, role: "admin" } } }),
}));

// As TanStack v5: a new result object per render around stable mutate and
// mutateAsync (#2098).
vi.mock("@/hooks/use-users", () => {
  const noop = vi.fn();
  const result = (mutateAsync: unknown) => ({
    mutate: noop,
    mutateAsync,
    isPending: false,
  });
  return {
    useUsers: () => ({ data: mockUsers, isLoading: false, error: mockError }),
    useCreateUser: () => result(noop),
    useDeleteUser: () => result(noop),
    useUpdateUserRole: () => result(mockUpdateRole),
    useUpdateUserCanWrite: () => result(mockUpdateCanWrite),
    useResetPassword: () => result(mockResetPassword),
    useSetUserDisabled: () => result(mockSetDisabled),
  };
});

vi.mock("@neoboard/components", () => {
  const Box = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Nothing = () => null;
  return {
    Button: ({
      children,
      onClick,
      disabled,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    Input: ({
      value,
      onChange,
      placeholder,
      "aria-label": ariaLabel,
    }: {
      value?: string;
      onChange?: React.ChangeEventHandler<HTMLInputElement>;
      placeholder?: string;
      "aria-label"?: string;
    }) => (
      <input
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    ),
    Label: Nothing,
    Dialog: ({
      open,
      children,
    }: {
      open: boolean;
      children?: React.ReactNode;
    }) => (open ? <div role="dialog">{children}</div> : null),
    DialogContent: MockDialogContent,
    DialogHeader: Nothing,
    DialogTitle: Nothing,
    DialogDescription: Nothing,
    DialogFooter: Box,
    // A select whose items are buttons: jsdom cannot open a Radix one.
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange: (v: string) => void;
      children?: React.ReactNode;
    }) => (
      <SelectContext.Provider value={onValueChange}>
        {children}
      </SelectContext.Provider>
    ),
    SelectContent: Box,
    SelectItem: function SelectItem({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) {
      const pick = React.useContext(SelectContext);
      return (
        <button role="option" onClick={() => pick(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => (
      <button aria-label={ariaLabel} />
    ),
    SelectValue: Nothing,
    Checkbox: Nothing,
    // The menu is always open here. A disabled item is aria-disabled and still
    // takes a click, as Radix's does: its handler must refuse it too.
    DropdownMenu: Box,
    DropdownMenuTrigger: Nothing,
    DropdownMenuContent: Box,
    DropdownMenuSeparator: Nothing,
    DropdownMenuItem: ({
      children,
      onClick,
      disabled,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button role="menuitem" onClick={onClick} aria-disabled={disabled}>
        {children}
      </button>
    ),
    EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
    LoadingButton: Nothing,
    LoadingOverlay: Box,
    PasswordInput: Nothing,
    CopyButton: Nothing,
    // As the real one: either button closes the dialog, confirm first runs
    // onConfirm, and focus goes back after the render that closes it.
    ConfirmDialog: function ConfirmDialog({
      open,
      onOpenChange,
      title,
      description,
      confirmText,
      onConfirm,
      returnFocusTo,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      title: string;
      description: string;
      confirmText: string;
      onConfirm: () => void;
      returnFocusTo?: HTMLElement | null;
    }) {
      const wasOpen = React.useRef(open);
      React.useEffect(() => {
        if (wasOpen.current && !open) returnFocusTo?.focus();
        wasOpen.current = open;
      });
      return open ? (
        <div role="dialog" aria-label={title}>
          <p>{description}</p>
          <button onClick={() => onOpenChange(false)}>Cancel</button>
          <button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmText}
          </button>
        </div>
      ) : null;
    },
    useToast: () => ({ toast: mockToast }),
    focusedMenuTrigger: () => menuTrigger,
  };
});

import UsersPage from "../page";

// What `focusedMenuTrigger()` finds: the row's "User actions" button.
const menuTrigger = document.body.appendChild(document.createElement("button"));

/** A user's kit row, found by their (unique) email. */
const row = (id: string) => {
  const email = mockUsers.find((u) => u.id === id)?.email as string;
  return within(screen.getByText(email).closest("tr") as HTMLElement);
};

beforeEach(() => {
  mockError = null;
  mockSetDisabled.mockReset();
  mockUpdateRole.mockReset();
  mockUpdateCanWrite.mockReset();
  mockToast.mockReset();
  mockSetDisabled.mockResolvedValue({});
  mockUsers = [
    user({ id: ME, name: "Alice", email: "alice@example.com", role: "admin" }),
    user({ id: "u2", name: "Dana" }),
    user({ id: "u3", name: "Eve", disabledAt: "2026-09-20T00:00:00.000Z" }),
  ];
});

describe("UsersPage — disable and enable (#2049)", () => {
  it("offers Disable on an enabled user and Enable on a disabled one", () => {
    render(<UsersPage />);

    expect(row("u2").getByRole("menuitem", { name: "Disable" })).toBeEnabled();
    expect(row("u2").queryByRole("menuitem", { name: "Enable" })).toBeNull();
    expect(row("u3").getByRole("menuitem", { name: "Enable" })).toBeEnabled();
    expect(row("u3").queryByRole("menuitem", { name: "Disable" })).toBeNull();
  });

  it("offers neither Disable nor Enable on the admin's own row", () => {
    render(<UsersPage />);

    expect(
      row(ME).queryByRole("menuitem", { name: /^(Disable|Enable)$/ }),
    ).toBeNull();
    expect(row(ME).getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("asks before disabling, says what happens, then sends { disabled: true } and names the user", async () => {
    render(<UsersPage />);

    fireEvent.click(row("u2").getByRole("menuitem", { name: "Disable" }));
    expect(mockSetDisabled).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: "Disable User" });
    expect(dialog).toHaveTextContent(
      "Dana will not be able to sign in, and their API keys will stop working.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Disable" }));

    expect(mockSetDisabled).toHaveBeenCalledWith({ id: "u2", disabled: true });
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "User disabled",
          description: expect.stringContaining("Dana"),
        }),
      ),
    );
    expect(screen.queryByRole("dialog", { name: "Disable User" })).toBeNull();
  });

  it("disables nobody when the admin cancels the confirmation", () => {
    render(<UsersPage />);

    fireEvent.click(row("u2").getByRole("menuitem", { name: "Disable" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Disable User" })).getByRole(
        "button",
        { name: "Cancel" },
      ),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockSetDisabled).not.toHaveBeenCalled();
  });

  it("enables without asking, sends { disabled: false } and names the user", async () => {
    render(<UsersPage />);

    fireEvent.click(row("u3").getByRole("menuitem", { name: "Enable" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockSetDisabled).toHaveBeenCalledWith({ id: "u3", disabled: false });
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "User enabled",
          description: expect.stringContaining("Eve"),
        }),
      ),
    );
  });

  it("says why when the change fails", async () => {
    mockSetDisabled.mockRejectedValue(new Error("User not found"));
    render(<UsersPage />);

    fireEvent.click(row("u3").getByRole("menuitem", { name: "Enable" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        title: "Failed to enable user",
        description: "User not found",
        variant: "destructive",
      }),
    );
  });

  it("still reports a failed Disable when the error carries no message", async () => {
    mockSetDisabled.mockRejectedValue("offline");
    render(<UsersPage />);

    fireEvent.click(row("u2").getByRole("menuitem", { name: "Disable" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Disable",
      }),
    );

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        title: "Failed to disable user",
        description: "Something went wrong.",
        variant: "destructive",
      }),
    );
  });

  it("reads Disabled in the status column of a disabled user, and only theirs", () => {
    render(<UsersPage />);

    expect(row("u3").getByText("Disabled")).toBeInTheDocument();
    expect(row("u2").queryByText("Disabled")).toBeNull();
    expect(row("u2").getByText("Active")).toBeInTheDocument();
    expect(row(ME).queryByText("Disabled")).toBeNull();
  });

  it("names a user who has no name by their email", async () => {
    mockUsers = [user({ id: "u4", name: null, email: "noname@example.com" })];
    render(<UsersPage />);

    fireEvent.click(row("u4").getByRole("menuitem", { name: "Disable" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Disable",
      }),
    );

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining("noname@example.com"),
        }),
      ),
    );
  });
});

describe("UsersPage — role and write changes, from the row menu (#2098, #2254)", () => {
  it.each([
    {
      change: "Make reader",
      mutateAsync: mockUpdateRole,
      ok: "Role updated",
      fail: "Failed to update role",
      sent: { id: "u2", role: "reader" },
    },
    {
      change: "Remove write access",
      mutateAsync: mockUpdateCanWrite,
      ok: "Write permission updated",
      fail: "Failed to update write permission",
      sent: { id: "u2", canWrite: false },
    },
  ])(
    "$change: sends the change, and back-to-back changes each get a toast naming the user, a failure too",
    async ({ change, mutateAsync, ok, fail, sent }) => {
      mutateAsync
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("User not found"));
      render(<UsersPage />);

      fireEvent.click(row("u2").getByRole("menuitem", { name: change }));
      fireEvent.click(row("u3").getByRole("menuitem", { name: change }));
      fireEvent.click(row("u2").getByRole("menuitem", { name: change }));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith({
          title: fail,
          description: "User not found",
          variant: "destructive",
        }),
      );
      expect(mutateAsync).toHaveBeenCalledWith(sent);
      for (const name of ["Dana", "Eve"]) {
        expect(mockToast).toHaveBeenCalledWith({
          title: ok,
          description: expect.stringContaining(name),
        });
      }
    },
  );

  it("grants write access to a creator who has none", () => {
    mockUsers = [user({ id: "u2", canWrite: false })];
    render(<UsersPage />);

    fireEvent.click(row("u2").getByRole("menuitem", { name: "Allow writing" }));

    expect(mockUpdateCanWrite).toHaveBeenCalledWith({
      id: "u2",
      canWrite: true,
    });
  });

  it("offers no role or write change on the admin's own row, nor write access for a reader", () => {
    mockUsers = [
      user({ id: ME, name: "Alice", role: "admin" }),
      user({ id: "r1", name: "Rae", role: "reader" }),
    ];
    render(<UsersPage />);

    expect(
      row(ME).queryByRole("menuitem", { name: /^Make |write/i }),
    ).toBeNull();
    expect(row("r1").queryByRole("menuitem", { name: /write/i })).toBeNull();
    expect(
      row("r1").getByRole("menuitem", { name: "Make admin" }),
    ).toBeEnabled();
  });
});

describe("UsersPage — where focus goes after a question (#2086)", () => {
  it.each(["Delete", "Disable"])(
    "%s: Cancel puts focus back on the row's menu button",
    (item) => {
      menuTrigger.blur();
      render(<UsersPage />);

      fireEvent.click(row("u2").getByRole("menuitem", { name: item }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(menuTrigger).toHaveFocus();
    },
  );

  it("a confirmed Delete puts focus on the page heading: the row is leaving", () => {
    render(<UsersPage />);

    fireEvent.click(row("u2").getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Delete User" })).getByRole(
        "button",
        { name: "Delete" },
      ),
    );

    expect(screen.getByRole("heading", { name: "Users" })).toHaveFocus();
  });
});

// #2146: Create User and Temporary Password have no Trigger either.
it.each([
  ["Create user", "Cancel", (opener: HTMLElement) => opener],
  ["Require Password Change", "Done", () => menuTrigger],
])(
  "closing what %s opened puts focus back on its opener (#2146)",
  async (name, close, target) => {
    menuTrigger.blur();
    mockResetPassword.mockResolvedValue({ generatedPassword: "s3cret" });
    render(<UsersPage />);
    const opener = screen.getAllByText(name).at(-1)!;

    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole("button", { name: close }));

    expect(target(opener)).toHaveFocus();
  },
);

describe("UsersPage — kit rows (#2254)", () => {
  /** The names in the list, top to bottom. */
  const names = () =>
    within(screen.getByRole("table", { name: "Users" }))
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.querySelector("td")?.firstElementChild?.textContent);

  it("subtitles the page with the headcount and how many are disabled", () => {
    render(<UsersPage />);
    expect(screen.getByText("3 people · 1 disabled")).toBeInTheDocument();
  });

  it("shows name and email, then role, write access, created and status", () => {
    mockUsers = [
      user({
        id: "u3",
        name: "Eve",
        disabledAt: "2020-09-20T12:00:00Z",
        createdAt: "2020-09-20T12:00:00Z",
      }),
    ];
    render(<UsersPage />);
    const cells = row("u3")
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells.slice(0, 3)).toEqual([
      "Eveu3@example.com",
      "Creator",
      "Can write",
    ]);
    expect(cells.slice(3, 5)).toEqual(["Sep 20, 2020", "Disabled"]);
  });

  it("lists newest first, then orders by the header clicked, and flips on a second click", () => {
    mockUsers = [
      user({ id: "a", name: "Bea", createdAt: "2026-10-01T00:00:00Z" }),
      user({ id: "b", name: "Zed", createdAt: "2026-10-09T00:00:00Z" }),
      user({ id: "c", name: "Max", createdAt: "2026-10-05T00:00:00Z" }),
    ];
    render(<UsersPage />);
    expect(names()).toEqual(["Zed", "Max", "Bea"]);

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(names()).toEqual(["Bea", "Max", "Zed"]);
    expect(screen.getByRole("columnheader", { name: /^Name/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );

    fireEvent.click(screen.getByRole("button", { name: /^Name/ }));
    expect(names()).toEqual(["Zed", "Max", "Bea"]);
  });

  it("narrows by status and by one search over name and email, both in the filter sentence", () => {
    render(<UsersPage />);
    fireEvent.click(screen.getByRole("option", { name: "Disabled" }));
    expect(screen.queryByText("dana@example.com")).toBeNull();
    expect(screen.getByText("u3@example.com")).toBeInTheDocument();
    expect(screen.getByText("Status is")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search users"), {
      target: { value: " u3@ " },
    });
    expect(screen.getByText("Name or email contains")).toBeInTheDocument();
    expect(screen.getByText("u3@")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search users"), {
      target: { value: "zzz" },
    });
    expect(
      screen.getByText("No users match these filters."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("u2@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Search users")).toHaveValue("");
  });

  describe("paging", () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        user({
          id: `n${i}`,
          name: `User ${String(i).padStart(2, "0")}`,
          createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
        }),
      );

    it("moves on with Next page, to the last page", () => {
      mockUsers = many(45);
      render(<UsersPage />);
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Next page" }));
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));
      expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    });

    it.each([
      ["a filter chip is removed", /Remove .* filter/],
      ["Reset is clicked", "Reset"],
    ])("goes back to page 1 when %s", (_label, name) => {
      mockUsers = many(45);
      render(<UsersPage />);
      fireEvent.change(screen.getByLabelText("Search users"), {
        target: { value: "User" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    });

    it("names the status filter for assistive tech", () => {
      render(<UsersPage />);
      expect(
        screen.getByRole("button", { name: "Filter by status" }),
      ).toBeInTheDocument();
    });

    it("stays on the page it was clamped to when the list shrinks and then grows", () => {
      mockUsers = many(45);
      const { rerender } = render(<UsersPage />);
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));

      mockUsers = many(25);
      rerender(<UsersPage />);
      expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

      mockUsers = many(45);
      rerender(<UsersPage />);
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });
  });

  it("keeps the admin gate: a 403 shows the denial and no list", () => {
    mockError = new Error("Forbidden");
    mockUsers = [];
    render(<UsersPage />);
    expect(screen.getByText("Admin access required")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
