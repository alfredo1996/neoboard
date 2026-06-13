"use client";

import { useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { Users as UsersIcon, Plus, MoreVertical, KeyRound } from "lucide-react";
import {
  useUsers,
  useCreateUser,
  useDeleteUser,
  useUpdateUserRole,
  useUpdateUserCanWrite,
  useResetPassword,
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
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Switch,
  Checkbox,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@neoboard/components";
import {
  PageHeader,
  EmptyState,
  LoadingButton,
  LoadingOverlay,
  ConfirmDialog,
  DataGrid,
  PasswordInput,
  CopyButton,
} from "@neoboard/components";
import { useToast } from "@neoboard/components";
import type { ColumnDef } from "@tanstack/react-table";

const ROLE_VARIANTS: Record<
  UserRole,
  "default" | "secondary" | "destructive" | "outline"
> = {
  admin: "destructive",
  creator: "default",
  reader: "secondary",
};

type CanWriteCellProps = Readonly<{
  id: string;
  role: UserRole;
  canWrite: boolean;
  isSelf: boolean;
  isAdmin: boolean;
  onToggle: (id: string, checked: boolean) => void;
}>;

function CanWriteCell({
  id,
  role,
  canWrite,
  isSelf,
  isAdmin,
  onToggle,
}: CanWriteCellProps) {
  // Admins always write; readers never write; others use DB value
  const effectiveCanWrite =
    role === "admin" ? true : role === "reader" ? false : canWrite;
  if (!isAdmin) {
    return (
      <Badge variant={effectiveCanWrite ? "default" : "secondary"}>
        {effectiveCanWrite ? "Yes" : "No"}
      </Badge>
    );
  }

  // Disable toggle for self, admins (always on), and readers (always off)
  const disabled = isSelf || role !== "creator";
  const toggle = (
    <Switch
      checked={effectiveCanWrite}
      disabled={disabled}
      onCheckedChange={(checked) => onToggle(id, checked)}
    />
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed opacity-60">
            {toggle}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {isSelf
            ? "You cannot change your own write permission"
            : "Readers cannot execute write queries"}
        </TooltipContent>
      </Tooltip>
    );
  }

  return toggle;
}

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
  const updateRole = useUpdateUserRole();
  const updateCanWrite = useUpdateUserCanWrite();

  const resetPassword = useResetPassword();

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
  const [createError, setCreateError] = useState<string | null>(null);
  const [tempPasswordData, setTempPasswordData] = useState<{
    userName: string;
    password: string;
  } | null>(null);

  const handleRoleUpdate = useCallback(
    (id: string, val: string, displayName: string) => {
      updateRole.mutate(
        { id, role: val as UserRole },
        {
          onSuccess: () =>
            toast({
              title: "Role updated",
              description: `${displayName} is now a${val === "admin" ? "n" : ""} ${val}.`,
            }),
          onError: (err) =>
            toast({
              title: "Failed to update role",
              description:
                err instanceof Error ? err.message : "Something went wrong.",
              variant: "destructive",
            }),
        },
      );
    },
    [updateRole, toast],
  );

  const handleCanWriteToggle = useCallback(
    (id: string, checked: boolean, displayName: string) => {
      updateCanWrite.mutate(
        { id, canWrite: checked },
        {
          onSuccess: () =>
            toast({
              title: "Write permission updated",
              description: `${displayName} can ${checked ? "now" : "no longer"} execute write queries.`,
            }),
          onError: (err) =>
            toast({
              title: "Failed to update write permission",
              description:
                err instanceof Error ? err.message : "Something went wrong.",
              variant: "destructive",
            }),
        },
      );
    },
    [updateCanWrite, toast],
  );

  const handleForcePasswordChange = useCallback(
    async (user: UserListItem) => {
      try {
        const result = await resetPassword.mutateAsync({
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

  const columns = useMemo(
    (): ColumnDef<UserListItem, unknown>[] => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "email", header: "Email" },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => {
          const r = row.original.role;
          const isSelf = row.original.id === currentUserId;
          const displayName = row.original.name ?? row.original.email ?? "User";

          if (!isAdmin) {
            return (
              <Badge variant={ROLE_VARIANTS[r]} className="capitalize">
                {r}
              </Badge>
            );
          }

          if (isSelf) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-not-allowed">
                    <Badge
                      variant={ROLE_VARIANTS[r]}
                      className="capitalize opacity-60"
                    >
                      {r}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>You cannot change your own role</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Select
              value={r}
              onValueChange={(val) =>
                handleRoleUpdate(row.original.id, val, displayName)
              }
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="creator">Creator</SelectItem>
                <SelectItem value="reader">Reader</SelectItem>
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: "canWrite",
        header: "Write",
        cell: ({ row }) => (
          <CanWriteCell
            id={row.original.id}
            role={row.original.role}
            canWrite={row.original.canWrite}
            isSelf={row.original.id === currentUserId}
            isAdmin={isAdmin}
            onToggle={(id, checked) =>
              handleCanWriteToggle(
                id,
                checked,
                row.original.name ?? row.original.email ?? "User",
              )
            }
          />
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ getValue }) => {
          const v = getValue() as string;
          return v ? new Date(v).toLocaleDateString() : "—";
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const isSelf = row.original.id === currentUserId;
          if (!isAdmin) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">User actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={isSelf}
                  onClick={() => handleForcePasswordChange(row.original)}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Require Password Change
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isSelf}
                  className="text-destructive focus:text-destructive"
                  onClick={() => !isSelf && setDeleteTarget(row.original.id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [
      isAdmin,
      currentUserId,
      handleRoleUpdate,
      handleCanWriteToggle,
      handleForcePasswordChange,
    ],
  );

  async function handleCreate(e: React.FormEvent) {
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
    <div className="p-6">
      <PageHeader
        title="Users"
        description="Manage application users"
        actions={
          // Same gate as the table's denial state — non-admins must not see
          // admin affordances (#1036). Server-side enforcement already exists;
          // this is the UI half.
          isAdmin ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create User
            </Button>
          ) : undefined
        }
      />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
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
        onConfirm={() => {
          if (deleteTarget) {
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

      <Dialog
        open={tempPasswordData !== null}
        onOpenChange={(open) => {
          if (!open) setTempPasswordData(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">
              Make sure to copy this password now. It cannot be retrieved later.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempPasswordData(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-6">
        <LoadingOverlay loading={isLoading} text="Loading users...">
          {error instanceof Error && error.message === "Forbidden" ? (
            <EmptyState
              icon={<UsersIcon className="h-12 w-12" />}
              title="Admin access required"
              description="Only administrators can manage users."
            />
          ) : !users?.length ? (
            <EmptyState
              icon={<UsersIcon className="h-12 w-12" />}
              title="No users yet"
              description="Add team members so they can collaborate on dashboards."
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first user
                </Button>
              }
              secondaryAction={
                <a
                  href="https://neoboard.app/docs/getting-started/quick-start/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Read the docs
                </a>
              }
            />
          ) : (
            <DataGrid
              columns={columns}
              data={users}
              enableSorting
              pageSize={20}
            />
          )}
        </LoadingOverlay>
      </div>
    </div>
  );
}
