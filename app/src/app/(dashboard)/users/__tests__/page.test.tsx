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

/**
 * #2049 — an admin can disable and re-enable a user from the row menu, and a
 * disabled user carries a "Disabled" badge beside their name.
 */

const ME = "admin-1";
let mockUsers: UserListItem[] = [];
const mockSetDisabled = vi.fn();
const mockToast = vi.fn();

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

vi.mock("@/hooks/use-users", () => {
  const idle = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
  return {
    useUsers: () => ({ data: mockUsers, isLoading: false, error: null }),
    useCreateUser: idle,
    useDeleteUser: idle,
    useUpdateUserRole: idle,
    useUpdateUserCanWrite: idle,
    useResetPassword: idle,
    useSetUserDisabled: () => ({ ...idle(), mutateAsync: mockSetDisabled }),
  };
});

vi.mock("../role-cell", () => ({ RoleCell: () => null }));
vi.mock("../can-write-cell", () => ({ CanWriteCell: () => null }));

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
    Button: Box,
    Input: Nothing,
    Label: Nothing,
    Dialog: Nothing,
    DialogContent: Nothing,
    DialogHeader: Nothing,
    DialogTitle: Nothing,
    DialogDescription: Nothing,
    DialogFooter: Nothing,
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
    PageHeader: Nothing,
    EmptyState: Nothing,
    LoadingButton: Nothing,
    LoadingOverlay: Box,
    PasswordInput: Nothing,
    CopyButton: Nothing,
    // As the real one: either button closes the dialog, confirm first runs
    // onConfirm.
    ConfirmDialog: ({
      open,
      onOpenChange,
      title,
      description,
      confirmText,
      onConfirm,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      title: string;
      description: string;
      confirmText: string;
      onConfirm: () => void;
    }) =>
      open ? (
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
      ) : null,
    // One <tr> per user, each column's cell rendered as TanStack would.
    DataGrid: ({
      columns,
      data,
    }: {
      columns: Column[];
      data: UserListItem[];
    }) => (
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
    ),
    useToast: () => ({ toast: mockToast }),
  };
});

import UsersPage from "../page";

const row = (id: string) => within(screen.getByTestId(`row-${id}`));

beforeEach(() => {
  mockSetDisabled.mockReset();
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

  it("does not let the admin disable their own account, as Delete does not", () => {
    render(<UsersPage />);

    const own = row(ME).getByRole("menuitem", { name: "Disable" });
    expect(own).toHaveAttribute("aria-disabled", "true");
    expect(row(ME).getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    fireEvent.click(own);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockSetDisabled).not.toHaveBeenCalled();
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
