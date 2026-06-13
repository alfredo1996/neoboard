"use client";

import { useRef, useState } from "react";
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
  useImportDashboard,
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
  Checkbox,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { isNeoDashFormat } from "@/lib/dashboard/neodash-converter";
import { ExportError, classifyExportError } from "@/lib/dashboard/export-error";

// ── Types for import dialog ──────────────────────────────────────────

interface ConnectionInfo {
  name: string;
  type: string;
}

interface ParsedImport {
  payload: unknown;
  dashboardName: string;
  widgetCount: number;
  isNeoDash: boolean;
  connections: Record<string, ConnectionInfo>;
}

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

// ── ImportDashboardDialog ─────────────────────────────────────────────

interface ImportDashboardDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Synthesized placeholder key used for NeoDash imports. Must match the
 * server's NEODASH_PLACEHOLDER_KEY in app/src/app/api/dashboards/import/route.ts.
 */
const NEODASH_PLACEHOLDER_KEY = "neodash-default";

interface ImportSuccessState {
  id: string;
  notes: string[];
}

function ImportDashboardDialog({
  open,
  onOpenChange,
}: ImportDashboardDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [fileError, setFileError] = useState<string | null>(null);
  // Post-import state: dialog replaces the form with a notes summary and
  // View / Stay buttons. Cleared on reset / dialog close.
  const [successState, setSuccessState] = useState<ImportSuccessState | null>(
    null,
  );

  const { data: availableConnections = [] } = useConnections();
  const importDashboard = useImportDashboard();

  function reset() {
    setParsed(null);
    setMapping({});
    setSkipped(new Set());
    setFileError(null);
    setSuccessState(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  }

  function toggleSkip(key: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // Clear any selection — skipping clears the mapping value
        setMapping((m) => ({ ...m, [key]: "" }));
      }
      return next;
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    setParsed(null);
    setMapping({});
    setSkipped(new Set());
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (isNeoDashFormat(json)) {
        // NeoDash — synthesize a single placeholder for the whole dashboard.
        // NeoDash always pointed at one global Neo4j; surface that as one
        // required mapping in the UI.
        const widgetCount =
          (json.pages as Array<{ reports?: unknown[] }>)?.reduce(
            (sum: number, p) => sum + (p.reports?.length ?? 0),
            0,
          ) ?? 0;
        const title =
          (json as { title?: string }).title ?? "Imported Dashboard";
        // Placeholder name intentionally avoids repeating the dashboard title
        // — the title is already shown above in the parsed-preview box, and
        // duplicating it caused strict-mode locator collisions in E2E tests
        // (the same text would resolve to 2 elements in the dialog).
        const synthesized: Record<string, ConnectionInfo> = {
          [NEODASH_PLACEHOLDER_KEY]: {
            name: "Neo4j connection",
            type: "neo4j",
          },
        };
        setMapping({ [NEODASH_PLACEHOLDER_KEY]: "" });
        setParsed({
          payload: json,
          dashboardName: title,
          widgetCount: widgetCount,
          isNeoDash: true,
          connections: synthesized,
        });
      } else if (json.formatVersion === 1) {
        // NeoBoard export
        const connections = (json.connections ?? {}) as Record<
          string,
          ConnectionInfo
        >;
        const widgetCount =
          (json.layout?.pages as Array<{ widgets?: unknown[] }>)?.reduce(
            (sum: number, p) => sum + (p.widgets?.length ?? 0),
            0,
          ) ?? 0;
        const initialMapping: Record<string, string> = {};
        for (const key of Object.keys(connections)) {
          initialMapping[key] = "";
        }
        setMapping(initialMapping);
        setParsed({
          payload: json,
          dashboardName: json.dashboard?.name ?? "Imported Dashboard",
          widgetCount,
          isNeoDash: false,
          connections,
        });
      } else {
        setFileError(
          "Unrecognised file format. Expected a NeoBoard or NeoDash export.",
        );
      }
    } catch {
      setFileError("Failed to parse file. Make sure it is a valid JSON file.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed) return;

    try {
      const result = await importDashboard.mutateAsync({
        payload: parsed.payload,
        connectionMapping: mapping,
        skippedConnections: Array.from(skipped),
      });
      // Don't redirect — replace the form with notes + View/Stay buttons.
      setSuccessState({ id: result.id, notes: result.notes ?? [] });
    } catch (error) {
      setFileError(
        error instanceof Error ? error.message : "Failed to import dashboard.",
      );
    }
  }

  const hasConnections = parsed && Object.keys(parsed.connections).length > 0;
  const allMapped =
    !hasConnections ||
    Object.entries(mapping).every(([key, v]) => skipped.has(key) || v !== "");

  // Post-success view: replace the form with notes + View/Stay buttons.
  if (successState) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Dashboard imported</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="rounded-md border p-3 bg-muted/40">
              <p className="text-sm font-medium truncate">
                {parsed?.dashboardName ?? "Imported dashboard"}
              </p>
              <p className="text-xs text-muted-foreground">
                Imported successfully.
              </p>
            </div>
            {successState.notes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Import notes</p>
                <ul className="list-disc pl-5 space-y-1 max-h-60 overflow-y-auto text-sm text-muted-foreground">
                  {successState.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Stay here
            </Button>
            <Button
              type="button"
              onClick={() => {
                const id = successState.id;
                handleOpenChange(false);
                router.push(`/${id}`);
              }}
            >
              View dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Import Dashboard</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="import-file">Dashboard file (.json)</Label>
              <Input
                id="import-file"
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFile}
                className="mt-2 cursor-pointer"
              />
              {fileError && (
                <p className="text-sm text-destructive mt-1">{fileError}</p>
              )}
            </div>

            {parsed && (
              <div className="rounded-md border p-3 bg-muted/40 space-y-1">
                <p className="text-sm font-medium truncate">
                  {parsed.dashboardName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {parsed.widgetCount} widget
                  {parsed.widgetCount === 1 ? "" : "s"}
                  {parsed.isNeoDash
                    ? " · NeoDash format"
                    : " · NeoBoard format"}
                </p>
              </div>
            )}

            {hasConnections && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Map each connection placeholder to a local connection, or
                  check &ldquo;Skip&rdquo; to import without one (widgets will
                  need a connection assigned before they can load data).
                </p>
                {Object.entries(parsed.connections).map(([key, info]) => {
                  const compatible = availableConnections.filter(
                    (c) => c.type === info.type,
                  );
                  const isSkipped = skipped.has(key);
                  const hasNoCompatible = compatible.length === 0;
                  return (
                    <div
                      key={key}
                      className="rounded-md border p-3 space-y-2 bg-card"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {info.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {info.type}
                          </p>
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer shrink-0">
                          <Checkbox
                            checked={isSkipped}
                            onCheckedChange={() => toggleSkip(key)}
                          />
                          Skip
                        </label>
                      </div>
                      {!isSkipped && (
                        <>
                          <Select
                            value={mapping[key] ?? ""}
                            onValueChange={(val) =>
                              setMapping((prev) => ({ ...prev, [key]: val }))
                            }
                            disabled={hasNoCompatible}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select connection" />
                            </SelectTrigger>
                            <SelectContent>
                              {hasNoCompatible ? (
                                <SelectItem value="__none__" disabled>
                                  No {info.type} connections
                                </SelectItem>
                              ) : (
                                compatible.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          {hasNoCompatible && (
                            <p className="text-xs text-muted-foreground">
                              No compatible {info.type} connections in your
                              tenant.{" "}
                              <a
                                href="/connections"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline-offset-4 hover:underline"
                              >
                                Create one
                              </a>{" "}
                              or check &ldquo;Skip&rdquo; to import without.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={importDashboard.isPending}
              loadingText="Importing..."
              disabled={!parsed || !allMapped}
            >
              Import
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
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
            // Success feedback for a destructive action (#1046) — matches the
            // users-page convention (name-free description: the name in a
            // toast would linger after the card disappears and read as stale).
            deleteDashboard.mutate(deleteTarget.id, {
              onSuccess: () =>
                toast({
                  title: "Dashboard deleted",
                  description: "The dashboard has been removed.",
                }),
              onError: (err) =>
                toast({
                  title: "Failed to delete dashboard",
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
