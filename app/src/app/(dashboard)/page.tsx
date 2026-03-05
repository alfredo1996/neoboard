"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
} from "@neoboard/components";
import { isNeoDashFormat } from "@/lib/neodash-converter";

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
    throw new Error(`Failed to export dashboard (${res.status})`);
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

function ImportDashboardDialog({ open, onOpenChange }: ImportDashboardDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);

  const { data: availableConnections = [] } = useConnections();
  const importDashboard = useImportDashboard();

  function reset() {
    setParsed(null);
    setMapping({});
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    setParsed(null);
    setMapping({});
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (isNeoDashFormat(json)) {
        // NeoDash — no connection mapping needed
        const widgetCount = (json.pages as Array<{ reports?: unknown[] }>)?.reduce(
          (sum: number, p) => sum + (p.reports?.length ?? 0),
          0
        ) ?? 0;
        setParsed({
          payload: json,
          dashboardName: (json as { title?: string }).title ?? "Imported Dashboard",
          widgetCount: widgetCount,
          isNeoDash: true,
          connections: {},
        });
      } else if (json.formatVersion === 1) {
          // NeoBoard export
          const connections = (json.connections ?? {}) as Record<string, ConnectionInfo>;
          const widgetCount = (json.layout?.pages as Array<{ widgets?: unknown[] }>)?.reduce(
            (sum: number, p) => sum + (p.widgets?.length ?? 0),
            0
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
          setFileError("Unrecognised file format. Expected a NeoBoard or NeoDash export.");
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
      });
      handleOpenChange(false);
      router.push(`/${result.id}`);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Failed to import dashboard.");
    }
  }

  const hasConnections = parsed && !parsed.isNeoDash && Object.keys(parsed.connections).length > 0;
  const allMapped =
    !hasConnections ||
    Object.values(mapping).every((v) => v !== "");

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
                <p className="text-sm font-medium truncate">{parsed.dashboardName}</p>
                <p className="text-xs text-muted-foreground">
                  {parsed.widgetCount} widget{parsed.widgetCount === 1 ? "" : "s"}
                  {parsed.isNeoDash ? " · NeoDash format" : " · NeoBoard format"}
                </p>
              </div>
            )}

            {hasConnections && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Map each connection placeholder to a local connection:
                </p>
                {Object.entries(parsed.connections).map(([key, info]) => {
                  const compatible = availableConnections.filter((c) => c.type === info.type);
                  return (
                    <div key={key} className="grid grid-cols-2 gap-2 items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{info.name}</p>
                        <p className="text-xs text-muted-foreground">{info.type}</p>
                      </div>
                      <Select
                        value={mapping[key] ?? ""}
                        onValueChange={(val) =>
                          setMapping((prev) => ({ ...prev, [key]: val }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select connection" />
                        </SelectTrigger>
                        <SelectContent>
                          {compatible.length === 0 ? (
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

// ── Main page ─────────────────────────────────────────────────────────

export default function DashboardListPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const systemRole = session?.user?.role ?? "creator";

  const { data: dashboardList, isLoading } = useDashboards();
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();
  const duplicateDashboard = useDuplicateDashboard();
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

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

      <ImportDashboardDialog open={showImport} onOpenChange={setShowImport} />

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
                    className="flex flex-col cursor-pointer transition-colors hover:bg-accent/50"
                    onClick={() => router.push(`/${d.id}`)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base truncate">{d.name}</CardTitle>
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
                                  <span className="sr-only">Dashboard options</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => router.push(`/${d.id}/edit`)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                {canDuplicate && (
                                  <DropdownMenuItem
                                    onClick={() => duplicateDashboard.mutate(d.id)}
                                    disabled={duplicateDashboard.isPending}
                                  >
                                    <Copy className="mr-2 h-4 w-4" />
                                    Duplicate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => {
                                    void triggerExport(d.id, d.name).catch((err) => {
                                      console.error("Export failed", err);
                                    });
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
                                      onClick={() => setDeleteTarget(d.id)}
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
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-label="Public" />
                          )}
                          <Badge variant="secondary">{d.role}</Badge>
                        </div>
                      </div>
                      {d.description && (
                        <CardDescription className="line-clamp-2">{d.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1 p-4 pt-0">
                      <DashboardMiniPreview widgets={d.preview ?? []} />
                    </CardContent>
                    <CardFooter className="pt-0 text-xs text-muted-foreground justify-between">
                      <TimeAgo date={d.updatedAt} />
                      <span className="flex items-center gap-1">
                        <Grid2X2 className="h-3 w-3" />
                        {d.widgetCount ?? 0} widget{(d.widgetCount ?? 0) !== 1 ? "s" : ""}
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
