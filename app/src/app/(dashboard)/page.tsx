"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Plus, LayoutDashboard, Copy } from "lucide-react";
import {
  useDashboards,
  useCreateDashboard,
  useDeleteDashboard,
  useDuplicateDashboard,
} from "@/hooks/use-dashboards";
import {
  Button,
  Input,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Label,
} from "@neoboard/components";
import {
  PageHeader,
  EmptyState,
  LoadingButton,
  LoadingOverlay,
  ConfirmDialog,
} from "@neoboard/components";
import type { UserRole } from "@/lib/db/schema";

export default function DashboardListPage() {
  const router = useRouter();
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const systemRole = ((session?.user as any)?.role ?? "creator") as UserRole;

  const { data: dashboardList, isLoading } = useDashboards();
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();
  const duplicateDashboard = useDuplicateDashboard();
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const canCreate = systemRole === "admin" || systemRole === "creator";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const dashboard = await createDashboard.mutateAsync({ name: newName });
    setNewName("");
    setShowCreate(false);
    router.push(`/${dashboard.id}/edit`);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Dashboards"
        description="Create and manage your data dashboards"
        actions={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Dashboard
            </Button>
          ) : undefined
        }
      />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create Dashboard</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="dashboard-name">Name</Label>
              <Input
                id="dashboard-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Dashboard name"
                className="mt-2"
                autoFocus
              />
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
                loading={createDashboard.isPending}
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
        title="Delete Dashboard"
        description="This action cannot be undone. This will permanently delete this dashboard and all its widgets."
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            deleteDashboard.mutate(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />

      <div className="mt-6">
        <LoadingOverlay loading={isLoading} text="Loading dashboards...">
          {!dashboardList?.length ? (
            <EmptyState
              icon={<LayoutDashboard className="h-12 w-12" />}
              title="No dashboards yet"
              description={
                canCreate
                  ? "Create your first dashboard to start visualizing your data."
                  : "No dashboards have been assigned to you yet."
              }
              action={
                canCreate ? (
                  <Button onClick={() => setShowCreate(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create your first dashboard
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboardList.map((d) => {
                const canEdit =
                  d.role === "owner" ||
                  d.role === "editor" ||
                  d.role === "admin";
                const canDelete =
                  d.role === "owner" || d.role === "admin";
                const canDuplicate = systemRole !== "reader";

                return (
                  <Card
                    key={d.id}
                    className="cursor-pointer transition-colors hover:bg-accent/50"
                    onClick={() => router.push(`/${d.id}`)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">{d.name}</CardTitle>
                        <Badge variant="secondary">{d.role}</Badge>
                      </div>
                      {d.description && (
                        <CardDescription>{d.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/${d.id}/edit`);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {canDuplicate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateDashboard.mutate(d.id);
                            }}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Duplicate
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(d.id);
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </LoadingOverlay>
      </div>
    </div>
  );
}
