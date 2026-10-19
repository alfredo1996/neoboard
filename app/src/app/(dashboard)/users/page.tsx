"use client";

import { DOCS_LINKS } from "@/lib/docs-links";
import { returnFocus } from "@/lib/return-focus";
import {
  useState,
  useMemo,
  useCallback,
  useRef,
  type MouseEventHandler,
} from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import {
  Users as UsersIcon,
  Plus,
  MoreHorizontal,
  KeyRound,
  UserX,
  UserCheck,
} from "lucide-react";
import {
  useUsers,
  useCreateUser,
  useDeleteUser,
  useUpdateUserRole,
  useUpdateUserCanWrite,
  useResetPassword,
  useSetUserDisabled,
} from "@/hooks/use-users";
import type { UserListItem } from "@/hooks/use-users";
import type { UserRole } from "@/lib/db/schema";
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  focusedMenuTrigger,
  EmptyState,
  LoadingButton,
  LoadingOverlay,
  ConfirmDialog,
  PasswordInput,
  CopyButton,
  useToast,
} from "@neoboard/components";
import {
  FilterLine,
  List,
  ListRow,
  PageHeader,
} from "@neoboard/components/kit";
import {
  formatShortDate,
  matchesUserSearch,
  nextSort,
  pageCount,
  pageOf,
  roleLabel,
  sortUsers,
  userFilters,
  userListMeta,
  userMenuActions,
  writeLabel,
  type UserSort,
  type UserSortColumn,
  type UserStatusFilter,
} from "./user-list";

export default function UsersPage() {
  const { data: session } = useSession();
  type SessionUser = NonNullable<Session["user"]> & {
    id?: string;
    role?: UserRole;
    tenantId?: string;
  };
  const sessionUser = session?.user as SessionUser | undefined;
  const systemRole = (sessionUser?.role ?? "creator") as UserRole;
  const isAdmin = systemRole === "admin";
  const currentUserId: string | undefined = sessionUser?.id;

  const { toast } = useToast();
  const { data: users, isLoading, error } = useUsers();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  // The stable mutateAsync, not the result object TanStack rebuilds every
  // render: that rebuilt the columns, remounting every cell (#2098).
  const { mutateAsync: updateRole } = useUpdateUserRole();
  const { mutateAsync: updateCanWrite } = useUpdateUserCanWrite();
  const { mutateAsync: resetPassword } = useResetPassword();
  const { mutateAsync: setUserDisabled } = useSetUserDisabled();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    email: string;
    password: string;
    role: UserRole;
    forcePasswordChange: boolean;
  }>({
    name: "",
    email: "",
    password: "",
    role: "creator",
    forcePasswordChange: false,
  });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<UserListItem | null>(null);
  // What opened the dialog showing (#2086, #2146): none has a Trigger. Kept
  // after it closes: Radix hands focus back after that render.
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusOpener = () => returnFocus(returnFocusTo, headingRef.current);
  const openCreate: MouseEventHandler<HTMLButtonElement> = (e) => {
    setReturnFocusTo(e.currentTarget);
    setShowCreate(true);
  };
  const [createError, setCreateError] = useState<string | null>(null);
  const [tempPasswordData, setTempPasswordData] = useState<{
    userName: string;
    password: string;
  } | null>(null);

  // mutateAsync, not mutate's callbacks: TanStack v5 runs those for the
  // latest call only, so a second change would swallow the first toast (#1912).
  const handleRoleUpdate = useCallback(
    async (id: string, val: string, displayName: string) => {
      try {
        await updateRole({ id, role: val as UserRole });
        toast({
          title: "Role updated",
          description: `${displayName} is now a${val === "admin" ? "n" : ""} ${val}.`,
        });
      } catch (err) {
        toast({
          title: "Failed to update role",
          description:
            err instanceof Error ? err.message : "Something went wrong.",
          variant: "destructive",
        });
      }
    },
    [updateRole, toast],
  );

  const handleCanWriteToggle = useCallback(
    async (id: string, checked: boolean, displayName: string) => {
      try {
        await updateCanWrite({ id, canWrite: checked });
        toast({
          title: "Write permission updated",
          description: `${displayName} can ${checked ? "now" : "no longer"} run their own write queries. Submitting forms doesn't need this permission.`,
        });
      } catch (err) {
        toast({
          title: "Failed to update write permission",
          description:
            err instanceof Error ? err.message : "Something went wrong.",
          variant: "destructive",
        });
      }
    },
    [updateCanWrite, toast],
  );

  const handleForcePasswordChange = useCallback(
    async (user: UserListItem) => {
      // Read before the await, while the row's menu still has focus (#2146).
      setReturnFocusTo(focusedMenuTrigger());
      try {
        const result = await resetPassword({
          id: user.id,
          generatePassword: true,
          forcePasswordChange: true,
        });
        if (result.generatedPassword) {
          setTempPasswordData({
            userName: user.name ?? user.email ?? "User",
            password: result.generatedPassword,
          });
        }
        toast({
          title: "Password reset",
          description: `${user.name ?? user.email} must change their password on next login.`,
        });
      } catch (err) {
        toast({
          title: "Failed to reset password",
          description:
            err instanceof Error ? err.message : "Something went wrong.",
          variant: "destructive",
        });
      }
    },
    [resetPassword, toast],
  );

  const handleSetDisabled = useCallback(
    async (user: UserListItem, disabled: boolean) => {
      const name = displayNameOf(user);
      try {
        await setUserDisabled({ id: user.id, disabled });
        toast(
          disabled
            ? {
                title: "User disabled",
                description: `${name} can no longer sign in, and their API keys no longer work.`,
              }
            : {
                title: "User enabled",
                description: `${name} can sign in again, and their API keys work again.`,
              },
        );
      } catch (err) {
        toast({
          title: `Failed to ${disabled ? "disable" : "enable"} user`,
          description:
            err instanceof Error ? err.message : "Something went wrong.",
          variant: "destructive",
        });
      }
    },
    [setUserDisabled, toast],
  );

  // Newest first, as the old table was (#2254).
  const [sort, setSort] = useState<UserSort>({
    column: "Created",
    direction: "descending",
  });
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const resetFilters = () => {
    setStatusFilter("all");
    setSearch("");
    setPage(0);
  };

  const visibleUsers = useMemo(() => {
    const narrowed = (users ?? []).filter((u) => {
      if (!matchesUserSearch(u, search)) return false;
      if (statusFilter === "all") return true;
      return statusFilter === "disabled" ? !!u.disabledAt : !u.disabledAt;
    });
    return sortUsers(narrowed, sort);
  }, [users, search, statusFilter, sort]);
  const pages = pageCount(visibleUsers.length);
  // A delete or a narrower filter can leave the page past the end.
  const pageIndex = Math.min(page, pages - 1);
  // Keep the clamp, or a later create would jump the view back to `page`.
  if (page !== pageIndex) setPage(pageIndex);

  const forbidden = error instanceof Error && error.message === "Forbidden";

  function renderRow(u: UserListItem) {
    const isSelf = u.id === currentUserId;
    const displayName = displayNameOf(u);
    const menuActions = userMenuActions(u, isSelf);
    return (
      <ListRow
        key={u.id}
        title={u.name ?? u.email ?? "—"}
        description={u.name && u.email ? u.email : undefined}
        meta={[
          roleLabel(u.role),
          writeLabel(u),
          formatShortDate(u.createdAt),
          u.disabledAt ? "Disabled" : "Active",
        ]}
        menu={
          isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`User actions for ${displayName}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {menuActions.roles.map((role) => (
                  <DropdownMenuItem
                    key={role}
                    onClick={() =>
                      void handleRoleUpdate(u.id, role, displayName)
                    }
                  >
                    Make {role}
                  </DropdownMenuItem>
                ))}
                {menuActions.write && (
                  <DropdownMenuItem
                    onClick={() =>
                      void handleCanWriteToggle(
                        u.id,
                        menuActions.write === "grant",
                        displayName,
                      )
                    }
                  >
                    {menuActions.write === "grant"
                      ? "Allow writing"
                      : "Remove write access"}
                  </DropdownMenuItem>
                )}
                {(menuActions.roles.length > 0 || menuActions.write) && (
                  <DropdownMenuSeparator />
                )}
                <DropdownMenuItem
                  disabled={isSelf}
                  onClick={() => handleForcePasswordChange(u)}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Require Password Change
                </DropdownMenuItem>
                {!isSelf && (
                  <DisableToggleItem
                    user={u}
                    onDisable={(user) => {
                      setReturnFocusTo(focusedMenuTrigger());
                      setDisableTarget(user);
                    }}
                    onEnable={(user) => void handleSetDisabled(user, false)}
                  />
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isSelf}
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    if (isSelf) return;
                    setReturnFocusTo(focusedMenuTrigger());
                    setDeleteTarget(u.id);
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
    );
  }

  async function handleCreate(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    try {
      const created = await createUser.mutateAsync(form);
      setForm({
        name: "",
        email: "",
        password: "",
        role: "creator",
        forcePasswordChange: false,
      });
      setShowCreate(false);
      toast({
        title: "User created",
        description: `${created.name ?? created.email} has been added as a ${created.role}.`,
      });
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create user",
      );
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Users"
        titleRef={headingRef}
        meta={users?.length ? userListMeta(users) : "Manage application users"}
        actions={
          // Same gate as the table's denial state — non-admins must not see
          // admin affordances (#1036). Server-side enforcement already exists;
          // this is the UI half.
          isAdmin ? (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create user
            </Button>
          ) : undefined
        }
      />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent onCloseAutoFocus={focusOpener}>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>
                Add a user, set their initial password, and choose their role.
                You can require them to change it at first sign-in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="user-name">Name</Label>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">Password</Label>
                <PasswordInput
                  id="user-password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  required
                />
              </div>
              {isAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="user-role">Role</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, role: v as UserRole }))
                    }
                  >
                    <SelectTrigger id="user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="creator">Creator</SelectItem>
                      <SelectItem value="reader">Reader</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="user-force-password-change"
                  checked={form.forcePasswordChange}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({
                      ...f,
                      forcePasswordChange: checked === true,
                    }))
                  }
                />
                <Label htmlFor="user-force-password-change">
                  Require password change on next login
                </Label>
              </div>
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                loading={createUser.isPending}
                loadingText="Creating..."
              >
                Create
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete User"
        description="This will permanently delete this user and all their data."
        confirmText="Delete"
        variant="destructive"
        returnFocusTo={returnFocusTo}
        onConfirm={() => {
          if (deleteTarget) {
            // The row leaves once the list refetches: land on the heading.
            setReturnFocusTo(headingRef.current);
            deleteUser.mutate(deleteTarget, {
              onSuccess: () =>
                toast({
                  title: "User deleted",
                  description: "The user has been removed.",
                }),
              onError: (err) =>
                toast({
                  title: "Failed to delete user",
                  description:
                    err instanceof Error
                      ? err.message
                      : "Something went wrong.",
                  variant: "destructive",
                }),
            });
            setDeleteTarget(null);
          }
        }}
      />

      <ConfirmDialog
        open={disableTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDisableTarget(null);
        }}
        title="Disable User"
        description={`${displayNameOf(disableTarget)} will not be able to sign in, and their API keys will stop working. You can enable the account again later.`}
        confirmText="Disable"
        variant="destructive"
        returnFocusTo={returnFocusTo}
        onConfirm={() => {
          if (disableTarget) void handleSetDisabled(disableTarget, true);
        }}
      />

      <Dialog
        open={tempPasswordData !== null}
        onOpenChange={(open) => {
          if (!open) setTempPasswordData(null);
        }}
      >
        {/* #1282: both paragraphs below already describe this dialog —
            aria-describedby takes a space-separated id list, so link them
            rather than inventing a third copy of the same warning. */}
        <DialogContent
          aria-describedby="temp-password-desc temp-password-warning"
          onCloseAutoFocus={focusOpener}
        >
          <DialogHeader>
            <DialogTitle>Temporary Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p
              id="temp-password-desc"
              className="text-sm text-muted-foreground"
            >
              A temporary password has been generated for{" "}
              <span className="font-medium text-foreground">
                {tempPasswordData?.userName}
              </span>
              . They will be required to change it on their next login.
            </p>
            <div className="flex items-center gap-2 rounded-md bg-muted p-3">
              <code className="flex-1 text-sm font-mono break-all">
                {tempPasswordData?.password}
              </code>
              <CopyButton value={tempPasswordData?.password ?? ""} />
            </div>
            <p
              id="temp-password-warning"
              className="text-xs text-muted-foreground"
            >
              Make sure to copy this password now. It cannot be retrieved later.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempPasswordData(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The ground behind the panels, as on the dashboards page (#2219). */}
      <div className="flex-1 space-y-4 bg-page-ground p-4 md:p-7">
        <LoadingOverlay loading={isLoading} text="Loading users...">
          {forbidden && (
            <EmptyState
              icon={<UsersIcon className="h-12 w-12" />}
              title="Admin access required"
              description="Only administrators can manage users."
            />
          )}
          {!forbidden && !users?.length && (
            <EmptyState
              icon={<UsersIcon className="h-12 w-12" />}
              title="No users yet"
              description="Add team members so they can collaborate on dashboards."
              action={
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first user
                </Button>
              }
              secondaryAction={
                <a
                  href={DOCS_LINKS.firstDashboard}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Read the docs
                </a>
              }
            />
          )}
          {!forbidden && !!users?.length && (
            <>
              <div className="flex flex-wrap gap-3">
                <Input
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="max-w-xs"
                />
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v as UserStatusFilter);
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FilterLine
                prefix="Showing"
                filters={userFilters(statusFilter, search)}
                onRemove={(id) => {
                  if (id === "search") setSearch("");
                  else setStatusFilter("all");
                  setPage(0);
                }}
                onReset={resetFilters}
              />
              {visibleUsers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No users match these filters.
                </p>
              ) : (
                <List
                  label="Users"
                  columns={USER_COLUMNS}
                  sort={sort}
                  onSort={(column) => {
                    setSort((s) => nextSort(s, column as UserSortColumn));
                    setPage(0);
                  }}
                >
                  {pageOf(visibleUsers, pageIndex).map(renderRow)}
                </List>
              )}
              {pages > 1 && (
                <nav
                  aria-label="Pagination"
                  className="flex items-center justify-end gap-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    Page {pageIndex + 1} of {pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageIndex === 0}
                    onClick={() => setPage(pageIndex - 1)}
                  >
                    Previous page
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageIndex >= pages - 1}
                    onClick={() => setPage(pageIndex + 1)}
                  >
                    Next page
                  </Button>
                </nav>
              )}
            </>
          )}
        </LoadingOverlay>
      </div>
    </div>
  );
}

const USER_COLUMNS: readonly UserSortColumn[] = [
  "Name",
  "Role",
  "Write",
  "Created",
  "Status",
];

function displayNameOf(user: UserListItem | null): string {
  return user?.name ?? user?.email ?? "This user";
}

/**
 * Disable on an enabled user, Enable on a disabled one (#2049). The page does
 * not render it on the admin's own row; the API refuses a self-PATCH too.
 */
function DisableToggleItem({
  user,
  onDisable,
  onEnable,
}: Readonly<{
  user: UserListItem;
  onDisable: (user: UserListItem) => void;
  onEnable: (user: UserListItem) => void;
}>) {
  const disabled = Boolean(user.disabledAt);
  const Icon = disabled ? UserCheck : UserX;
  return (
    <DropdownMenuItem onClick={() => (disabled ? onEnable : onDisable)(user)}>
      <Icon className="mr-2 h-4 w-4" />
      {disabled ? "Enable" : "Disable"}
    </DropdownMenuItem>
  );
}
