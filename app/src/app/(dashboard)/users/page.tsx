"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Users as UsersIcon, Plus } from "lucide-react";
import { useUsers, useCreateUser, useDeleteUser, useUpdateUserRole } from "@/hooks/use-users";
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
} from "@neoboard/components";
import {
  PageHeader,
  EmptyState,
  LoadingButton,
  LoadingOverlay,
  ConfirmDialog,
  DataGrid,
  PasswordInput,
} from "@neoboard/components";
import type { ColumnDef } from "@tanstack/react-table";

const ROLE_VARIANTS: Record<UserRole, "default" | "secondary" | "destructive" | "outline"> = {
  admin: "destructive",
  creator: "default",
  reader: "secondary",
};

export default function UsersPage() {
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const systemRole = ((session?.user as any)?.role ?? "creator") as UserRole;
  const isAdmin = systemRole === "admin";

  const { data: users, isLoading, error } = useUsers();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const updateRole = useUpdateUserRole();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }>({ name: "", email: "", password: "", role: "creator" });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const columns = useMemo(
    (): ColumnDef<UserListItem, unknown>[] => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "email", header: "Email" },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => {
          const r = row.original.role;
          if (!isAdmin) {
            return (
              <Badge variant={ROLE_VARIANTS[r]} className="capitalize">
                {r}
              </Badge>
            );
          }
          return (
            <Select
              value={r}
              onValueChange={(val) =>
                updateRole.mutate({ id: row.original.id, role: val as UserRole })
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
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setDeleteTarget(row.original.id)}
          >
            Delete
          </Button>
        ),
      },
    ],
    [isAdmin, updateRole]
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    try {
      await createUser.mutateAsync(form);
      setForm({ name: "", email: "", password: "", role: "creator" });
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Users"
        description="Manage application users"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create User
          </Button>
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
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">Password</Label>
                <PasswordInput
                  id="user-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
              {isAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="user-role">Role</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}
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
            deleteUser.mutate(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />

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
              title="No users found"
              description="Create your first user to get started."
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create User
                </Button>
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
