"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Plus,
  LayoutDashboard,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Grid2X2,
  Globe,
  Upload,
  Download,
  Database,
  BarChart3,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import {
  useDashboards,
  useCreateDashboard,
  useDeleteDashboard,
  useDuplicateDashboard,
} from "@/hooks/use-dashboards";
import { useConnections } from "@/hooks/use-connections";
import {
  Button,
  Input,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Label,
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
  TimeAgo,
  DashboardMiniPreview,
  useToast,
} from "@neoboard/components";
import { ExportError, classifyExportError } from "@/lib/dashboard/export-error";
import { ImportDashboardDialog } from "./import-dashboard-dialog";

// ── triggerExport helper ─────────────────────────────────────────────

async function triggerExport(id: string, name: string) {
  const res = await fetch(`/api/dashboards/${id}/export`);
  if (!res.ok) {
    throw new ExportError(
      `Failed to export dashboard (${res.status})`,
      res.status,
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  a.href = url;
  a.download = `dashboard-${slug}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── GettingStartedGuide ──────────────────────────────────────────────

interface GettingStartedGuideProps {
  readonly onCreateDashboard: () => void;
}

function GettingStartedGuide({ onCreateDashboard }: GettingStartedGuideProps) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="rounded-lg border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LayoutDashboard className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-semibold">Welcome to NeoBoard</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Build dashboards that connect to your Neo4j and PostgreSQL databases.
          Get started in three simple steps.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={onCreateDashboard}>
            <Plus className="mr-2 h-4 w-4" />
            Create your first dashboard
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a
              href="https://neoboard.app/docs/getting-started/quick-start/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Read the docs
            </a>
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Database className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">
              <span className="mr-2 text-muted-foreground">1.</span>
              Add a connection
            </CardTitle>
            <CardDescription>
              Connect to your Neo4j or PostgreSQL database so NeoBoard can query
              your data.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href="/connections"
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              Go to Connections
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">
              <span className="mr-2 text-muted-foreground">2.</span>
              Create a dashboard
            </CardTitle>
            <CardDescription>
              Give your dashboard a name and pick the layout that fits your
              story.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <button
              type="button"
              onClick={onCreateDashboard}
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              Start now
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">
              <span className="mr-2 text-muted-foreground">3.</span>
              Add widgets
            </CardTitle>
            <CardDescription>
              Write a Cypher or SQL query, pick a chart type, and visualize your
              results.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <a
              href="https://neoboard.app/docs/guides/widgets/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              Widget guide
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </a>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function DashboardListPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { toast } = useToast();
  const systemRole = session?.user?.role ?? "creator";

  const { data: dashboardList, isLoading } = useDashboards();
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();
  const duplicateDashboard = useDuplicateDashboard();
  // Pre-warm the connections query so ImportDashboardDialog has cached data
  // ready when the user opens it — without this, opening the dialog kicks off
  // a fresh fetch and the NeoDash auto-pick races the file upload.
  useConnections();
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const canCreate = systemRole === "admin" || systemRole === "creator";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      setNameError("Name is required");
      return;
    }
    setNameError(null);
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
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowImport(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import
              </Button>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Dashboard
              </Button>
            </div>
          ) : undefined
        }
      />

      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) {
            setNewName("");
            setNameError(null);
          }
        }}
      >
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
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Dashboard name"
                className={`mt-2 ${nameError ? "border-destructive" : ""}`}
                autoFocus
                aria-invalid={nameError ? "true" : undefined}
                aria-describedby={
                  nameError ? "dashboard-name-error" : undefined
                }
              />
              {nameError ? (
                <p
                  id="dashboard-name-error"
                  className="text-xs text-destructive mt-1"
                >
                  {nameError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Give your dashboard a name to get started.
                </p>
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
        title={`Delete "${deleteTarget?.name ?? "Dashboard"}"?`}
        description="This action cannot be undone. This will permanently delete this dashboard and all its widgets."
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            deleteDashboard.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />

      <ImportDashboardDialog open={showImport} onOpenChange={setShowImport} />

      <div className="mt-6">
        <LoadingOverlay loading={isLoading} text="Loading dashboards...">
          {!dashboardList?.length ? (
            canCreate ? (
              <GettingStartedGuide
                onCreateDashboard={() => setShowCreate(true)}
              />
            ) : (
              <EmptyState
                icon={<LayoutDashboard className="h-12 w-12" />}
                title="No dashboards yet"
                description="Ask an admin or editor to share one with you."
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
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboardList.map((d) => {
                const canEdit =
                  d.role === "owner" ||
                  d.role === "editor" ||
                  d.role === "admin";
                const canDelete = d.role === "owner" || d.role === "admin";
                const canDuplicate = systemRole !== "reader";

                return (
                  <Card
                    key={d.id}
                    data-testid="dashboard-card"
                    className="flex flex-col cursor-pointer transition-colors hover:bg-accent/50"
                    onClick={() => router.push(`/${d.id}`)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base truncate">
                          {d.name}
                        </CardTitle>
                        <div className="flex items-center gap-1 shrink-0">
                          {(canEdit || canDuplicate || canDelete) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                  <span className="sr-only">
                                    Dashboard options
                                  </span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {canEdit && (
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/${d.id}/edit`)}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                {canDuplicate && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      duplicateDashboard.mutate(d.id)
                                    }
                                    disabled={duplicateDashboard.isPending}
                                  >
                                    <Copy className="mr-2 h-4 w-4" />
                                    Duplicate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => {
                                    void triggerExport(d.id, d.name).catch(
                                      (err) => {
                                        console.error("Export failed", err);
                                        toast({
                                          ...classifyExportError(err),
                                          variant: "destructive",
                                        });
                                      },
                                    );
                                  }}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Export
                                </DropdownMenuItem>
                                {canDelete && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() =>
                                        setDeleteTarget({
                                          id: d.id,
                                          name: d.name,
                                        })
                                      }
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {d.isPublic && (
                            <Globe
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-label="Public"
                            />
                          )}
                          <Badge variant="secondary">{d.role}</Badge>
                        </div>
                      </div>
                      {d.description && (
                        <CardDescription className="line-clamp-2">
                          {d.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1 p-4 pt-0">
                      <DashboardMiniPreview widgets={d.preview ?? []} />
                    </CardContent>
                    <CardFooter className="pt-0 text-xs text-muted-foreground justify-between">
                      <span className="flex items-center gap-1 truncate">
                        <TimeAgo date={d.updatedAt} />
                        {d.updatedByName && (
                          <span className="truncate">by {d.updatedByName}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Grid2X2 className="h-3 w-3" />
                        {d.widgetCount ?? 0} widget
                        {(d.widgetCount ?? 0) !== 1 ? "s" : ""}
                      </span>
                    </CardFooter>
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
