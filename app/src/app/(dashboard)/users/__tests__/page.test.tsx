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

const ME = "admin-1";
let mockUsers: UserListItem[] = [];
const mockSetDisabled = vi.fn();
const mockUpdateRole = vi.fn();
const mockUpdateCanWrite = vi.fn();
const mockToast = vi.fn();
const mockResetPassword = vi.fn();
let gridColumns: unknown;

function user(overrides: Partial<UserListItem>): UserListItem {
  return {
    id: "u2",
    name: "Dana",
    email: "dana@example.com",
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
    useUsers: () => ({ data: mockUsers, isLoading: false, error: null }),
    useCreateUser: () => result(noop),
    useDeleteUser: () => result(noop),
    useUpdateUserRole: () => result(mockUpdateRole),
    useUpdateUserCanWrite: () => result(mockUpdateCanWrite),
    useResetPassword: () => result(mockResetPassword),
    useSetUserDisabled: () => result(mockSetDisabled),
  };
});

vi.mock("../role-cell", () => ({
  RoleCell: ({ onChange }: { onChange: (role: string) => void }) => (
    <button onClick={() => onChange("reader")}>Role</button>
  ),
}));
vi.mock("../can-write-cell", () => ({
  CanWriteCell: ({
    id,
    onToggle,
  }: {
    id: string;
    onToggle: (id: string, checked: boolean) => void;
  }) => <button onClick={() => onToggle(id, false)}>Write</button>,
}));

vi.mock("@neoboard/components", () => {
  const Box = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Nothing = () => null;
  type Column = {
    accessorKey?: keyof UserListItem;
    cell?: (ctx: unknown) => React.ReactNode;
  };
  return {
    Button: ({
      children,
      onClick,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
    }) => <button onClick={onClick}>{children}</button>,
    Input: Nothing,
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
    Select: Nothing,
    SelectContent: Nothing,
    SelectItem: Nothing,
    SelectTrigger: Nothing,
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
    Badge: ({ children }: { children?: React.ReactNode }) => (
      <span data-testid="badge">{children}</span>
    ),
    PageHeader: ({
      title,
      titleRef,
      actions,
    }: {
      title: string;
      titleRef?: React.Ref<HTMLHeadingElement>;
      actions?: React.ReactNode;
    }) => (
      <>
        <h1 ref={titleRef} tabIndex={-1}>
          {title}
        </h1>
        {actions}
      </>
    ),
    EmptyState: Nothing,
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
    // One <tr> per user, each column's cell rendered as TanStack would.
    DataGrid: ({
      columns,
      data,
    }: {
      columns: Column[];
      data: UserListItem[];
    }) => {
      gridColumns = columns;
      return (
        <table>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} data-testid={`row-${row.id}`}>
                {columns.map((c, i) => (
                  <td key={i}>
                    {c.cell
                      ? c.cell({
                          row: { original: row },
                          getValue: () =>
                            c.accessorKey ? row[c.accessorKey] : undefined,
                        })
                      : String(c.accessorKey ? (row[c.accessorKey] ?? "") : "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
    useToast: () => ({ toast: mockToast }),
    focusedMenuTrigger: () => menuTrigger,
  };
});

import UsersPage from "../page";

// What `focusedMenuTrigger()` finds: the row's "User actions" button.
const menuTrigger = document.body.appendChild(document.createElement("button"));

const row = (id: string) => within(screen.getByTestId(`row-${id}`));

beforeEach(() => {
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

  it("badges a disabled user beside their name, and only them", () => {
    render(<UsersPage />);

    expect(row("u3").getByTestId("badge")).toHaveTextContent("Disabled");
    expect(row("u2").queryByText("Disabled")).toBeNull();
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

describe("UsersPage — role and write changes (#2098)", () => {
  it("keeps the same columns across a re-render, so no cell remounts and drops focus", () => {
    const { rerender } = render(<UsersPage />);
    const first = gridColumns;

    rerender(<UsersPage />);

    expect(gridColumns).toBe(first);
  });

  it.each([
    {
      cell: "Role",
      mutateAsync: mockUpdateRole,
      ok: "Role updated",
      fail: "Failed to update role",
    },
    {
      cell: "Write",
      mutateAsync: mockUpdateCanWrite,
      ok: "Write permission updated",
      fail: "Failed to update write permission",
    },
  ])(
    "$cell: back-to-back changes each get a toast naming the user, a failure too",
    async ({ cell, mutateAsync, ok, fail }) => {
      mutateAsync
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("User not found"));
      render(<UsersPage />);

      fireEvent.click(row("u2").getByRole("button", { name: cell }));
      fireEvent.click(row("u3").getByRole("button", { name: cell }));
      fireEvent.click(row("u2").getByRole("button", { name: cell }));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith({
          title: fail,
          description: "User not found",
          variant: "destructive",
        }),
      );
      for (const name of ["Dana", "Eve"]) {
        expect(mockToast).toHaveBeenCalledWith({
          title: ok,
          description: expect.stringContaining(name),
        });
      }
    },
  );
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
  ["Create User", "Cancel", (opener: HTMLElement) => opener],
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
