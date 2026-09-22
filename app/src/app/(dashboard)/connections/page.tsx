"use client";

import { DOCS_LINKS } from "@/lib/docs-links";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Database, Plus, RefreshCw } from "lucide-react";
import { ConnectorIcon } from "@/components/connector-icon";
import {
  ConnectionDialog,
  type ConnectionDialogTarget,
} from "@/components/connection-dialog";
import { useConnectors } from "@/hooks/use-connectors";
import {
  useConnections,
  useConnectionUsage,
  useUpdateConnection,
  useDeleteConnection,
  useReassignConnection,
  useTestConnection,
} from "@/hooks/use-connections";
import {
  Button,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@neoboard/components";
import {
  PageHeader,
  EmptyState,
  LoadingButton,
  LoadingOverlay,
  ConfirmDialog,
  ConnectionCard,
  Alert,
  AlertDescription,
  useToast,
} from "@neoboard/components";
import type { ConnectionState } from "@neoboard/components";
import { useConnectionStatusStore } from "@/stores/connection-status-store";
import { connectionsToProbe } from "@/lib/connector/connections-to-probe";
import { runWindowed } from "@/lib/connector/run-windowed";
import { ClientQueueTimeoutError, QueueFullError } from "@/lib/api/api-client";

/** How many probes "Test all" keeps in flight (#1426). */
const TEST_ALL_WINDOW = 3;

export default function ConnectionsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const isAdmin = session?.user?.role === "admin";
  const { data: connections, isLoading } = useConnections();
  // #1899: every connector fact on this page — label, icon, category — is read
  // from the descriptors the server hands over; the create / edit / Duplicate
  // form is generated from them in ConnectionDialog (#1901).
  const connectorsQuery = useConnectors();
  const connectors = connectorsQuery.data;
  /**
   * A stored connection can outlive its connector — an external one that was
   * uninstalled. Known only once the descriptors are in: until then, and when
   * they cannot be loaded, no connection is called uninstalled.
   */
  const isInstalled = (type: string) =>
    connectors === undefined || connectors.some((c) => c.type === type);
  const updateConnection = useUpdateConnection();
  const deleteConnection = useDeleteConnection();
  const testConnection = useTestConnection();

  // What the create / edit / Duplicate dialog is open for; null when closed.
  const [dialogTarget, setDialogTarget] =
    useState<ConnectionDialogTarget | null>(null);
  // #1544: connection status lives in a module-level store, not useState, so
  // it survives the remount a client-side navigation causes: a result the
  // user asked for is still there when they come back.
  const statuses = useConnectionStatusStore((s) => s.statuses);
  const statusErrors = useConnectionStatusStore((s) => s.errors);
  const setStatus = useConnectionStatusStore((s) => s.setStatus);
  // #1426: progress of a running "Test all"; null when none is running.
  const [testAll, setTestAll] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  // Pre-fetch the usage breakdown whenever a delete is pending so the
  // confirm dialog can render the list of affected dashboards + widget
  // count before the user commits. Hook is disabled when deleteTarget is
  // null, so it only fires on the "open delete dialog" transition.
  const deleteUsage = useConnectionUsage(deleteTarget);
  // Reassign dialog state — opened from the delete dialog when the user
  // chooses to migrate widgets instead of deleting them.
  const [reassignTarget, setReassignTarget] = useState<string | null>(null);
  const [reassignChoice, setReassignChoice] = useState<string>("");
  const [reassignError, setReassignError] = useState<string | null>(null);
  const reassignConnection = useReassignConnection();
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

  /**
   * Probe one connection — only ever because the user asked (#1426): a row's
   * Test, "Test all", or a connection they just created or edited.
   *
   * Resolves "busy" when the scheduler turned the probe away (503 queue full,
   * 408 queue timeout). That probe never reached the database, so it is no
   * verdict: the row goes back to what it showed before — "Not checked" if
   * nothing — and never to "Error".
   */
  async function probe(id: string, batch = false): Promise<"done" | "busy"> {
    // Read from the store, not this render's snapshot: "Test all" outlives it.
    const known = useConnectionStatusStore.getState();
    const before = known.getStatus(id);
    const beforeError = known.getError(id);
    setStatus(id, "connecting");
    try {
      const result = await testConnection.mutateAsync(
        batch ? { id, batch } : { id },
      );
      setStatus(
        id,
        result.success ? "connected" : "error",
        result.success ? undefined : (result.error ?? undefined),
      );
    } catch (error) {
      if (
        error instanceof QueueFullError ||
        error instanceof ClientQueueTimeoutError
      ) {
        // "connecting" is another probe's progress, not something known.
        if (before === "connecting") setStatus(id, "unknown");
        else setStatus(id, before, beforeError);
        return "busy";
      }
      setStatus(id, "error", "Connection test failed");
    }
    return "done";
  }

  function toastBusy(count: number) {
    toast({
      title: "Server busy",
      description:
        count === 1
          ? "The test did not run. Try again in a moment."
          : `${count} connections were not tested. Try again in a moment.`,
    });
  }

  async function handleTest(id: string) {
    if ((await probe(id)) === "busy") toastBusy(1);
  }

  // #1545: only what the user may probe — the test route 404s for the rest,
  // which would paint a red Error over a healthy shared connection.
  const probeable = connectionsToProbe(connections ?? [], isAdmin).filter((c) =>
    isInstalled(c.type),
  );

  /** Three at a time, each row updating as its own result lands (#1426). */
  async function handleTestAll() {
    const total = probeable.length;
    let busy = 0;
    setTestAll({ done: 0, total });
    await runWindowed(
      probeable,
      TEST_ALL_WINDOW,
      async (c) => {
        if ((await probe(c.id, true)) === "busy") busy++;
      },
      (_c, done) => setTestAll({ done, total }),
    );
    setTestAll(null);
    if (busy > 0) toastBusy(busy);
  }

  /** A save closes the dialog and probes that one connection (#1426). */
  function handleSaved(id: string) {
    if (dialogTarget?.mode === "edit") toast({ title: "Connection updated" });
    setDialogTarget(null);
    handleTest(id);
  }

  // #1544: an id with no entry is "unknown" — not checked yet. It used to
  // fall through to "disconnected", which asserted every connection was down
  // for a frame on every visit.
  function getConnectionStatus(id: string): ConnectionState {
    return statuses[id] ?? "unknown";
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Connections"
        description="Manage your database connections"
        actions={
          <div className="flex items-center gap-2">
            {probeable.length > 0 && (
              <Button
                variant="outline"
                onClick={handleTestAll}
                disabled={testAll !== null}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {testAll
                  ? `Tested ${testAll.done} of ${testAll.total}…`
                  : "Test all"}
              </Button>
            )}
            <Button onClick={() => setDialogTarget({ mode: "create" })}>
              <Plus className="mr-2 h-4 w-4" />
              Add Connection
            </Button>
          </div>
        }
      />

      <ConnectionDialog
        target={dialogTarget}
        onClose={() => setDialogTarget(null)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Connection"
        description={
          deleteUsage.isLoading ? (
            "Checking widgets that use this connection…"
          ) : deleteUsage.isError ? (
            "Could not verify widget usage. You may proceed, but some widgets may stop working."
          ) : deleteUsage.data && deleteUsage.data.widgetCount > 0 ? (
            <div className="space-y-3">
              <p>
                This connection is used by{" "}
                <strong>
                  {deleteUsage.data.widgetCount} widget
                  {deleteUsage.data.widgetCount === 1 ? "" : "s"}
                </strong>{" "}
                on{" "}
                <strong>
                  {deleteUsage.data.dashboards.length} dashboard
                  {deleteUsage.data.dashboards.length === 1 ? "" : "s"}
                </strong>
                . Deleting it will break them:
              </p>
              <ul className="list-disc pl-5 space-y-1 max-h-40 overflow-y-auto">
                {deleteUsage.data.dashboards.slice(0, 10).map((d) => (
                  <li key={d.id}>
                    <span className="font-medium">{d.name}</span>{" "}
                    <span className="text-muted-foreground text-xs">
                      ({d.widgetCount} widget
                      {d.widgetCount === 1 ? "" : "s"})
                    </span>
                  </li>
                ))}
                {deleteUsage.data.dashboards.length > 10 && (
                  <li className="text-muted-foreground italic">
                    +{deleteUsage.data.dashboards.length - 10} more…
                  </li>
                )}
              </ul>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!deleteTarget) return;
                  setReassignTarget(deleteTarget);
                  setReassignChoice("");
                  setReassignError(null);
                  setDeleteTarget(null);
                }}
              >
                Re-assign widgets to another connection…
              </Button>
            </div>
          ) : (
            "This connection is not used by any widget. It will be permanently deleted."
          )
        }
        confirmText={
          deleteUsage.data && deleteUsage.data.widgetCount > 0
            ? "Delete anyway"
            : "Delete"
        }
        confirmDisabled={deleteUsage.isLoading}
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            const force =
              !!deleteUsage.data && deleteUsage.data.widgetCount > 0;
            deleteConnection.mutate({ id: deleteTarget, force });
            setDeleteTarget(null);
          }
        }}
      />

      <Dialog
        open={reassignTarget !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setReassignTarget(null);
            setReassignChoice("");
            setReassignError(null);
          }
        }}
      >
        {/* #1282: describes itself in the paragraph below — point at that
            instead of duplicating the sentence. */}
        <DialogContent aria-describedby="reassign-widgets-desc">
          <DialogHeader>
            <DialogTitle>Re-assign widgets</DialogTitle>
          </DialogHeader>
          {(() => {
            const sourceConn =
              reassignTarget != null
                ? connections?.find((c) => c.id === reassignTarget)
                : null;
            const compatible = (connections ?? []).filter(
              (c) =>
                c.id !== reassignTarget &&
                sourceConn &&
                c.type === sourceConn.type,
            );
            return (
              <div className="space-y-4 py-4">
                <p
                  id="reassign-widgets-desc"
                  className="text-sm text-muted-foreground"
                >
                  Pick a {sourceConn?.type ?? ""} connection to migrate widgets
                  to. Queries on widgets are not validated against the target
                  schema — broken queries will show their usual error state.
                </p>
                {compatible.length === 0 ? (
                  <Alert>
                    <AlertDescription>
                      No compatible {sourceConn?.type ?? ""} connections
                      available. Create one first.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="reassign-target">Target connection</Label>
                    <select
                      id="reassign-target"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                      value={reassignChoice}
                      onChange={(e) => setReassignChoice(e.target.value)}
                    >
                      <option value="">Select a connection…</option>
                      {compatible.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {reassignError && (
                  <Alert variant="destructive">
                    <AlertDescription>{reassignError}</AlertDescription>
                  </Alert>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignTarget(null)}>
              Cancel
            </Button>
            <LoadingButton
              loading={reassignConnection.isPending}
              loadingText="Re-assigning…"
              disabled={!reassignChoice || reassignConnection.isPending}
              onClick={async () => {
                if (!reassignTarget || !reassignChoice) return;
                setReassignError(null);
                try {
                  await reassignConnection.mutateAsync({
                    fromId: reassignTarget,
                    targetConnectionId: reassignChoice,
                  });
                  setReassignTarget(null);
                  setReassignChoice("");
                } catch (err) {
                  setReassignError(
                    err instanceof Error ? err.message : "Re-assign failed",
                  );
                }
              }}
            >
              Re-assign
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-6">
        <LoadingOverlay
          loading={isLoading || connectorsQuery.isLoading}
          text="Loading connections..."
        >
          {connections?.length ? (
            <div className="space-y-3">
              {connections.map((c) => {
                const status = getConnectionStatus(c.id);
                const installed = isInstalled(c.type);
                // The owner manages, or an admin (#901). With its connector
                // gone there is nothing left to test or configure — only to
                // delete.
                const canManage = c.isOwner || isAdmin;
                const canUse = canManage && installed;
                return (
                  <div key={c.id}>
                    <ConnectionCard
                      name={c.name}
                      host={
                        installed
                          ? c.type
                          : `${c.type} — connector not installed`
                      }
                      icon={
                        <ConnectorIcon
                          connector={connectors?.find((d) => d.type === c.type)}
                          className="h-5 w-5 text-muted-foreground"
                        />
                      }
                      status={status}
                      statusText={statusErrors[c.id]}
                      onClick={
                        status === "error" && statusErrors[c.id]
                          ? () =>
                              setExpandedErrorId((prev) =>
                                prev === c.id ? null : c.id,
                              )
                          : undefined
                      }
                      onTest={canUse ? () => handleTest(c.id) : undefined}
                      shared={c.visibility === "shared"}
                      // Management actions only for the owner (or admin —
                      // who can reach any connection via the API): shared
                      // connections render read-only for everyone else (#901).
                      onEdit={
                        canUse
                          ? () =>
                              setDialogTarget({
                                mode: "edit",
                                id: c.id,
                                name: c.name,
                                type: c.type,
                              })
                          : undefined
                      }
                      onDelete={
                        canManage ? () => setDeleteTarget(c.id) : undefined
                      }
                      // The copy opens on the source's type, pre-filled with
                      // its non-secret config (#1042). Secrets never leave the
                      // server, so they are typed again.
                      onDuplicate={
                        canUse
                          ? () =>
                              setDialogTarget({
                                mode: "create",
                                type: c.type,
                                prefillFrom: { id: c.id, name: c.name },
                              })
                          : undefined
                      }
                      onToggleVisibility={
                        isAdmin && c.isOwner
                          ? () =>
                              updateConnection.mutate({
                                id: c.id,
                                visibility:
                                  c.visibility === "shared"
                                    ? "private"
                                    : "shared",
                              })
                          : undefined
                      }
                      toggleVisibilityLabel={
                        c.visibility === "shared"
                          ? "Make private"
                          : "Share with workspace"
                      }
                    />
                    {expandedErrorId === c.id && statusErrors[c.id] && (
                      <Alert variant="destructive" className="mt-1">
                        <AlertDescription>
                          {statusErrors[c.id]}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Database className="h-12 w-12" />}
              title="No connections yet"
              description="Connect a database to start building dashboards."
              action={
                <Button onClick={() => setDialogTarget({ mode: "create" })}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first connection
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
        </LoadingOverlay>
      </div>
    </div>
  );
}
