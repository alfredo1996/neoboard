"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, LayoutDashboard } from "lucide-react";
import {
  useDashboards,
  useCreateDashboard,
  useDeleteDashboard,
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

export default function DashboardListPage() {
  const router = useRouter();
  const { data: dashboards, isLoading } = useDashboards();
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Dashboard
          </Button>
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
          {!dashboards?.length ? (
            <EmptyState
              icon={<LayoutDashboard className="h-12 w-12" />}
              title="No dashboards yet"
              description="Create your first dashboard to start visualizing your data."
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first dashboard
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboards.map((d) => (
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
                      {d.role === "owner" && (
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
              ))}
            </div>
          )}
        </LoadingOverlay>
      </div>
    </div>
  );
}
