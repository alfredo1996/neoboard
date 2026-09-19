"use client";

import { DOCS_LINKS } from "@/lib/docs-links";
import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { Database, Plus, ChevronDown, RefreshCw } from "lucide-react";
import { ConnectorIcon } from "@/components/connector-icon";
import { ConnectorTypePicker } from "@/components/connector-type-picker";
import { useConnector, useConnectors } from "@/hooks/use-connectors";
import {
  useConnections,
  useConnectionUsage,
  useCreateConnection,
  useUpdateConnection,
  useDeleteConnection,
  useReassignConnection,
  useTestConnection,
  useTestInlineConnection,
} from "@/hooks/use-connections";
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
  Switch,
} from "@neoboard/components";
import {
  PageHeader,
  EmptyState,
  LoadingButton,
  LoadingOverlay,
  ConfirmDialog,
  ConnectionCard,
  PasswordInput,
  DynamicConnectionFields,
  Alert,
  AlertDescription,
  useToast,
} from "@neoboard/components";
import type { ConnectionState } from "@neoboard/components";
import { useConnectionStatusStore } from "@/stores/connection-status-store";
import { connectionsToProbe } from "@/lib/connector/connections-to-probe";
import { runWindowed } from "@/lib/connector/run-windowed";
import { ClientQueueTimeoutError, QueueFullError } from "@/lib/api/api-client";
import { connectionFieldsOf } from "@/lib/connector/connection-fields";
import type { ConnectorType } from "@/lib/connector/connector-types";
import { hintForConnectionErrorCode } from "@/lib/connector/connection-error-classifier";
import { validateConnectionUri } from "@/lib/connector/validate-connection-uri";
import { missingRequiredConnectionFields } from "@/lib/connector/connection-form-validation";
import {
  parseOptionalInt,
  mapConfigToEditForm,
} from "@/lib/shared/parse-utils";

type DialogStep = "pick-type" | "fill-form";

/** How many probes "Test all" keeps in flight (#1426). */
const TEST_ALL_WINDOW = 3;

const DEFAULT_FORM = {
  name: "",
  // No connector is the default: the type picker (or Duplicate) sets it before
  // the form shows. The cast goes when #1900 opens `ConnectorType` to string.
  type: "" as ConnectorType,
  uri: "",
  username: "",
  password: "",
  database: "",
  // Advanced settings (stored as strings for form input, parsed to numbers on submit)
  connectionTimeout: "",
  queryTimeout: "",
  maxPoolSize: "",
  connectionAcquisitionTimeout: "",
  idleTimeout: "",
  statementTimeout: "",
  sslRejectUnauthorized: undefined as boolean | undefined,
  maxRows: "",
};

export default function ConnectionsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const isAdmin = session?.user?.role === "admin";
  const { data: connections, isLoading } = useConnections();
  // #1899: every connector fact on this page — label, icon, category, fields,
  // placeholders — is read from the descriptors the server hands over.
  const connectorsQuery = useConnectors();
  const connectors = connectorsQuery.data;
  /**
   * A stored connection can outlive its connector — an external one that was
   * uninstalled. Known only once the descriptors are in: until then, and when
   * they cannot be loaded, no connection is called uninstalled.
   */
  const isInstalled = (type: string) =>
    connectors === undefined || connectors.some((c) => c.type === type);
  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const deleteConnection = useDeleteConnection();
  const testConnection = useTestConnection();

  const testInline = useTestInlineConnection();
  const [inlineTestResult, setInlineTestResult] = useState<{
    success: boolean;
    error?: string;
    code?: "auth_failed" | "network" | "bad_uri" | "unknown";
  } | null>(null);

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>("pick-type");
  const [form, setForm] = useState(DEFAULT_FORM);
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const editTargetIdRef = useRef<string | null>(null);
  // Stale-response guard for the Duplicate prefill fetch (#1042)
  const duplicateSourceIdRef = useRef<string | null>(null);

  // Edit dialog state — only advanced settings are editable
  const [editTarget, setEditTarget] = useState<{
    id: string;
    name: string;
    type: ConnectorType;
  } | null>(null);
  const [editForm, setEditForm] = useState(DEFAULT_FORM);
  const formConnector = useConnector(form.type);
  const editConnector = useConnector(editTarget?.type);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditAdvanced, setShowEditAdvanced] = useState(true);

  const [createError, setCreateError] = useState<string | null>(null);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

  function buildConfig() {
    return {
      uri: form.uri,
      username: form.username,
      password: form.password,
      database: form.database || undefined,
      connectionTimeout: parseOptionalInt(form.connectionTimeout),
      queryTimeout: parseOptionalInt(form.queryTimeout),
      maxPoolSize: parseOptionalInt(form.maxPoolSize),
      connectionAcquisitionTimeout: parseOptionalInt(
        form.connectionAcquisitionTimeout,
      ),
      idleTimeout: parseOptionalInt(form.idleTimeout),
      statementTimeout: parseOptionalInt(form.statementTimeout),
      sslRejectUnauthorized: form.sslRejectUnauthorized,
      maxRows: parseOptionalInt(form.maxRows),
    };
  }

  /** Render a numeric input field for advanced settings. */
  function renderNumericField(
    id: string,
    label: string,
    field: keyof typeof DEFAULT_FORM,
    placeholder: string,
    min: number,
    max: number | undefined,
    formState: typeof DEFAULT_FORM,
    setFormState: React.Dispatch<React.SetStateAction<typeof DEFAULT_FORM>>,
  ) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="number"
          step={1}
          min={min}
          {...(max === undefined ? {} : { max })}
          value={formState[field] as string}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFormState((f) => ({ ...f, [field]: e.target.value }))
          }
          placeholder={placeholder}
        />
      </div>
    );
  }

  function numericField(
    id: string,
    label: string,
    field: keyof typeof DEFAULT_FORM,
    placeholder: string,
    min: number,
    max?: number,
  ) {
    return renderNumericField(
      id,
      label,
      field,
      placeholder,
      min,
      max,
      form,
      setForm,
    );
  }

  function editNumericField(
    id: string,
    label: string,
    field: keyof typeof DEFAULT_FORM,
    placeholder: string,
    min: number,
    max?: number,
  ) {
    return renderNumericField(
      id,
      label,
      field,
      placeholder,
      min,
      max,
      editForm,
      setEditForm,
    );
  }

  function openCreateDialog(type?: ConnectorType) {
    setForm({ ...DEFAULT_FORM, ...(type ? { type } : {}) });
    setDialogStep(type ? "fill-form" : "pick-type");
    setCreateError(null);
    setInlineTestResult(null);
    setShowCreate(true);
  }

  function closeCreateDialog() {
    setShowCreate(false);
    setDialogStep("pick-type");
    setCreateError(null);
    setInlineTestResult(null);
    setShowAdvanced(false);
  }

  function handlePickType(type: string) {
    // Whatever is installed may be picked. The cast goes with #1900.
    setForm((f) => ({ ...f, type: type as ConnectorType }));
    setDialogStep("fill-form");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    // Report all missing required fields at once via a styled inline alert
    // (form is noValidate) instead of one native browser tooltip at a time
    // (#1043).
    const missing = missingRequiredConnectionFields(form);
    if (missing.length > 0) {
      setCreateError(`Please fill in: ${missing.join(", ")}.`);
      return;
    }
    // Validate URI format client-side before save (#1043).
    const uriError = validateConnectionUri(
      form.uri,
      formConnector?.fields.find((field) => field.type === "uri"),
    );
    if (uriError) {
      setCreateError(uriError);
      return;
    }
    try {
      const newConn = await createConnection.mutateAsync({
        name: form.name,
        type: form.type,
        config: buildConfig(),
      });
      closeCreateDialog();
      handleTest(newConn.id);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create connection",
      );
    }
  }

  async function handleTestInline() {
    setInlineTestResult(null);
    try {
      const result = await testInline.mutateAsync({
        type: form.type,
        config: buildConfig(),
      });
      setInlineTestResult(result);
    } catch {
      setInlineTestResult({ success: false, error: "Connection test failed" });
    }
  }

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

  async function handleDuplicate(conn: {
    id: string;
    name: string;
    type: ConnectorType;
  }) {
    duplicateSourceIdRef.current = conn.id;
    setForm({
      ...DEFAULT_FORM,
      type: conn.type,
      name: `${conn.name} (copy)`,
    });
    setDialogStep("fill-form");
    setCreateError(null);
    setInlineTestResult(null);
    setShowCreate(true);

    // Prefill the non-secret config (URI, username, database, advanced
    // settings) from the source connection — the whole point of Duplicate
    // (#1042). The API never returns the password, so it stays blank and the
    // user re-enters it. Guard against races: if another Duplicate starts
    // before this fetch resolves, discard the stale response.
    try {
      const res = await fetch(`/api/connections/${conn.id}`);
      if (duplicateSourceIdRef.current !== conn.id) return; // stale response
      const body = await res.json();
      const config = body?.data?.config;
      if (config) {
        setForm((prev) => ({
          ...prev,
          ...mapConfigToEditForm(config),
        }));
      }
    } catch {
      // Non-critical — the dialog still works; user fills fields manually
    }
  }

  async function openEditDialog(conn: {
    id: string;
    name: string;
    type: ConnectorType;
  }) {
    editTargetIdRef.current = conn.id;
    setEditTarget(conn);
    setEditForm({ ...DEFAULT_FORM, type: conn.type, name: conn.name });
    setEditError(null);
    setEditLoading(true);
    setShowEditAdvanced(true);

    // Fetch existing config (sans password) and pre-fill the form.
    // Guard against races: if the user opens a different connection before this
    // fetch completes, discard the stale response.
    const controller = new AbortController();
    try {
      const res = await fetch(`/api/connections/${conn.id}`, {
        signal: controller.signal,
      });
      if (editTargetIdRef.current !== conn.id) return; // stale response
      const body = await res.json();
      const config = body?.data?.config;
      if (config) {
        setEditForm((prev) => ({
          ...prev,
          ...mapConfigToEditForm(config),
        }));
      }
    } catch {
      // Non-critical — form still works with empty fields
    } finally {
      setEditLoading(false);
    }
  }

  function buildEditConfig() {
    // Only include credential fields when the user has explicitly filled them in.
    // Omitting them (undefined) tells the server to keep the existing stored values
    // rather than overwriting them with blank strings. Gate on the *trimmed*
    // value so whitespace-only input (possible now the form is noValidate)
    // doesn't clobber stored credentials (#1043).
    const uri = editForm.uri.trim();
    const username = editForm.username.trim();
    return {
      ...(uri ? { uri } : {}),
      ...(username ? { username } : {}),
      ...(editForm.password.trim() ? { password: editForm.password } : {}),
      database: editForm.database.trim() || undefined,
      connectionTimeout: parseOptionalInt(editForm.connectionTimeout),
      queryTimeout: parseOptionalInt(editForm.queryTimeout),
      maxPoolSize: parseOptionalInt(editForm.maxPoolSize),
      connectionAcquisitionTimeout: parseOptionalInt(
        editForm.connectionAcquisitionTimeout,
      ),
      idleTimeout: parseOptionalInt(editForm.idleTimeout),
      statementTimeout: parseOptionalInt(editForm.statementTimeout),
      sslRejectUnauthorized: editForm.sslRejectUnauthorized,
      maxRows: parseOptionalInt(editForm.maxRows),
    };
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);

    if (!editForm.name.trim()) {
      setEditError("Name is required.");
      return;
    }
    // Validate URI *format* before save when the user changed it (blank keeps
    // the existing one). Catches malformed URIs client-side (#1043).
    if (editForm.uri.trim()) {
      const uriError = validateConnectionUri(
        editForm.uri,
        editConnector?.fields.find((field) => field.type === "uri"),
      );
      if (uriError) {
        setEditError(uriError);
        return;
      }
    }

    try {
      await updateConnection.mutateAsync({
        id: editTarget.id,
        name: editForm.name.trim(),
        config: buildEditConfig(),
      });
      setEditTarget(null);
      toast({ title: "Connection updated" });
      handleTest(editTarget.id);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Failed to update connection",
      );
    }
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
            <Button onClick={() => openCreateDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Connection
            </Button>
          </div>
        }
      />

      <Dialog
        open={showCreate}
        onOpenChange={(open: boolean) => {
          if (!open) closeCreateDialog();
        }}
      >
        <DialogContent className="flex flex-col overflow-hidden">
          {dialogStep === "pick-type" ? (
            <>
              <DialogHeader>
                <DialogTitle>Choose Connection Type</DialogTitle>
                <DialogDescription>
                  Select what this connection points at. You&apos;ll configure
                  its details next.
                </DialogDescription>
              </DialogHeader>
              <ConnectorTypePicker
                connectors={connectors}
                isLoading={connectorsQuery.isLoading}
                isError={connectorsQuery.isError}
                onRetry={() => connectorsQuery.refetch()}
                onPick={handlePickType}
              />
            </>
          ) : (
            <form
              onSubmit={handleCreate}
              noValidate
              className="flex min-h-0 flex-col overflow-hidden"
            >
              <DialogHeader>
                <DialogTitle>
                  New {formConnector?.label ?? form.type} Connection
                </DialogTitle>
                <DialogDescription>
                  Enter the host, credentials and options for this connection.
                  Credentials are encrypted before they&apos;re stored.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => setDialogStep("pick-type")}
                  >
                    ← Change type
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="conn-name">Name</Label>
                  <Input
                    id="conn-name"
                    value={form.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    required
                    placeholder="My Database"
                  />
                </div>

                {/* Credential fields generated from the connector's descriptor
                    (#1118, #1899) — no hardcoded per-connector arrays. */}
                <DynamicConnectionFields
                  fields={connectionFieldsOf(formConnector)}
                  values={form}
                  onChange={(name, value) =>
                    // Built-in credential fields are all text/password, so the
                    // value is always a string here.
                    setForm((f) => ({ ...f, [name]: value as string }))
                  }
                />

                {/* Advanced Settings */}
                <div className="border-t pt-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    Advanced Settings
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showAdvanced && (
                    <div className="mt-3 space-y-4">
                      {form.type === "neo4j" ? (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {numericField(
                              "conn-connection-timeout",
                              "Connection Timeout (ms)",
                              "connectionTimeout",
                              "30000",
                              0,
                            )}
                            {numericField(
                              "conn-query-timeout",
                              "Query Timeout (ms)",
                              "queryTimeout",
                              "2000",
                              0,
                            )}
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {numericField(
                              "conn-max-pool",
                              "Max Pool Size",
                              "maxPoolSize",
                              "100",
                              1,
                              100,
                            )}
                            {numericField(
                              "conn-acquisition-timeout",
                              "Acquisition Timeout (ms)",
                              "connectionAcquisitionTimeout",
                              "60000",
                              0,
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {numericField(
                              "conn-connection-timeout",
                              "Connection Timeout (ms)",
                              "connectionTimeout",
                              "10000",
                              0,
                            )}
                            {numericField(
                              "conn-idle-timeout",
                              "Idle Timeout (ms)",
                              "idleTimeout",
                              "10000",
                              0,
                            )}
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {numericField(
                              "conn-max-pool",
                              "Max Pool Size",
                              "maxPoolSize",
                              "10",
                              1,
                              100,
                            )}
                            {numericField(
                              "conn-statement-timeout",
                              "Statement Timeout (ms)",
                              "statementTimeout",
                              "30000",
                              0,
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="conn-ssl-reject">
                              Reject Unauthorized SSL
                            </Label>
                            <Switch
                              id="conn-ssl-reject"
                              checked={form.sslRejectUnauthorized ?? false}
                              onCheckedChange={(checked) =>
                                setForm((f) => ({
                                  ...f,
                                  sslRejectUnauthorized: checked,
                                }))
                              }
                            />
                          </div>
                        </>
                      )}

                      {/* Result limits — shared across connector types */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        {numericField(
                          "conn-max-rows",
                          "Max Rows per Query",
                          "maxRows",
                          "5000",
                          100,
                          100000,
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground -mt-2">
                        Results beyond this cap are truncated and a banner is
                        shown on the widget. Default 5,000. Increase cautiously
                        — higher limits raise per-query memory usage.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {createError && (
                <Alert variant="destructive">
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}
              {inlineTestResult && (
                <Alert
                  variant={inlineTestResult.success ? "default" : "destructive"}
                >
                  <AlertDescription>
                    {inlineTestResult.success ? (
                      "Connection successful!"
                    ) : (
                      <>
                        <div>
                          {inlineTestResult.error || "Connection failed"}
                        </div>
                        {inlineTestResult.code &&
                          inlineTestResult.code !== "unknown" && (
                            <div className="mt-1 text-sm opacity-90">
                              {hintForConnectionErrorCode(
                                inlineTestResult.code,
                                formConnector,
                              )}
                            </div>
                          )}
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter className="mt-4 shrink-0 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCreateDialog}
                >
                  Cancel
                </Button>
                <LoadingButton
                  type="button"
                  variant="secondary"
                  loading={testInline.isPending}
                  loadingText="Testing..."
                  disabled={!form.uri || !form.username || !form.password}
                  onClick={handleTestInline}
                >
                  Test Connection
                </LoadingButton>
                <LoadingButton
                  type="submit"
                  loading={createConnection.isPending}
                  loadingText="Creating..."
                >
                  Create
                </LoadingButton>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog — advanced options + credentials (required to re-encrypt) */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="flex flex-col overflow-hidden">
          <form
            onSubmit={handleEdit}
            noValidate
            className="flex min-h-0 flex-col overflow-hidden"
          >
            <DialogHeader>
              <DialogTitle>Edit {editTarget?.name}</DialogTitle>
              <DialogDescription>
                Update the settings for this connection. Leave the password
                blank to keep the stored credentials.
              </DialogDescription>
            </DialogHeader>
            {editLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
                <p className="text-sm text-muted-foreground">
                  Update your connection settings. Leave password blank to keep
                  the existing one.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                    required
                    placeholder="My database"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-uri">URI</Label>
                  <Input
                    id="edit-uri"
                    value={editForm.uri}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditForm((f) => ({ ...f, uri: e.target.value }))
                    }
                    required
                    placeholder={
                      editConnector?.fields.find((f) => f.type === "uri")
                        ?.placeholder
                    }
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-username">Username</Label>
                    <Input
                      id="edit-username"
                      value={editForm.username}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setEditForm((f) => ({ ...f, username: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-password">Password</Label>
                    <PasswordInput
                      id="edit-password"
                      value={editForm.password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setEditForm((f) => ({ ...f, password: e.target.value }))
                      }
                      placeholder="Leave blank to keep existing"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-database">
                    Database{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="edit-database"
                    value={editForm.database}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditForm((f) => ({ ...f, database: e.target.value }))
                    }
                  />
                </div>

                {/* Advanced Settings */}
                <div className="border-t pt-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowEditAdvanced(!showEditAdvanced)}
                  >
                    Advanced Settings
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showEditAdvanced ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showEditAdvanced && (
                    <div className="mt-3 space-y-4">
                      {editTarget?.type === "neo4j" ? (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {editNumericField(
                              "edit-connection-timeout",
                              "Connection Timeout (ms)",
                              "connectionTimeout",
                              "30000",
                              0,
                            )}
                            {editNumericField(
                              "edit-query-timeout",
                              "Query Timeout (ms)",
                              "queryTimeout",
                              "2000",
                              0,
                            )}
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {editNumericField(
                              "edit-max-pool",
                              "Max Pool Size",
                              "maxPoolSize",
                              "100",
                              1,
                              100,
                            )}
                            {editNumericField(
                              "edit-acquisition-timeout",
                              "Acquisition Timeout (ms)",
                              "connectionAcquisitionTimeout",
                              "60000",
                              0,
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {editNumericField(
                              "edit-connection-timeout",
                              "Connection Timeout (ms)",
                              "connectionTimeout",
                              "10000",
                              0,
                            )}
                            {editNumericField(
                              "edit-idle-timeout",
                              "Idle Timeout (ms)",
                              "idleTimeout",
                              "10000",
                              0,
                            )}
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {editNumericField(
                              "edit-max-pool",
                              "Max Pool Size",
                              "maxPoolSize",
                              "10",
                              1,
                              100,
                            )}
                            {editNumericField(
                              "edit-statement-timeout",
                              "Statement Timeout (ms)",
                              "statementTimeout",
                              "30000",
                              0,
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="edit-ssl-reject">
                              Reject Unauthorized SSL
                            </Label>
                            <Switch
                              id="edit-ssl-reject"
                              checked={editForm.sslRejectUnauthorized ?? false}
                              onCheckedChange={(checked) =>
                                setEditForm((f) => ({
                                  ...f,
                                  sslRejectUnauthorized: checked,
                                }))
                              }
                            />
                          </div>
                        </>
                      )}

                      {/* Result limits — shared across connector types */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        {editNumericField(
                          "edit-max-rows",
                          "Max Rows per Query",
                          "maxRows",
                          "5000",
                          100,
                          100000,
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground -mt-2">
                        Results beyond this cap are truncated and a banner is
                        shown on the widget. Default 5,000. Increase cautiously
                        — higher limits raise per-query memory usage.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            {editError && (
              <Alert variant="destructive">
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter className="mt-4 shrink-0 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTarget(null)}
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                loading={updateConnection.isPending}
                loadingText="Saving..."
              >
                Save
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
                      onEdit={canUse ? () => openEditDialog(c) : undefined}
                      onDelete={
                        canManage ? () => setDeleteTarget(c.id) : undefined
                      }
                      onDuplicate={
                        canUse ? () => handleDuplicate(c) : undefined
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
                <Button onClick={() => openCreateDialog()}>
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
