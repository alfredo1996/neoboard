"use client";

import { useState, useEffect, useRef } from "react";
import { Database, Plus, ChevronDown } from "lucide-react";
import { Neo4jLogo, PostgreSQLLogo } from "@/components/db-logos";
import {
  useConnections,
  useCreateConnection,
  useDeleteConnection,
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
  Alert,
  AlertDescription,
} from "@neoboard/components";
import type { ConnectionState } from "@neoboard/components";

type DialogStep = "pick-type" | "fill-form";

const DEFAULT_FORM = {
  name: "",
  type: "neo4j" as "neo4j" | "postgresql",
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
};

export default function ConnectionsPage() {
  const { data: connections, isLoading } = useConnections();
  const createConnection = useCreateConnection();
  const deleteConnection = useDeleteConnection();
  const testConnection = useTestConnection();

  const testInline = useTestInlineConnection();
  const [inlineTestResult, setInlineTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [dialogStep, setDialogStep] = useState<DialogStep>("pick-type");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const autoTestedRef = useRef(false);

  // Auto-test all connections on first load
  useEffect(() => {
    if (!connections?.length || autoTestedRef.current) return;
    autoTestedRef.current = true;
    for (const c of connections) {
      handleTest(c.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections]);

  const [createError, setCreateError] = useState<string | null>(null);
  const [testErrors, setTestErrors] = useState<Record<string, string>>({});

  /** Parse numeric string to integer, or return undefined if empty/invalid. */
  function parseOptionalInt(val: string): number | undefined {
    if (!val.trim()) return undefined;
    const n = Number(val);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
    return n;
  }

  function buildConfig() {
    return {
      uri: form.uri,
      username: form.username,
      password: form.password,
      database: form.database || undefined,
      connectionTimeout: parseOptionalInt(form.connectionTimeout),
      queryTimeout: parseOptionalInt(form.queryTimeout),
      maxPoolSize: parseOptionalInt(form.maxPoolSize),
      connectionAcquisitionTimeout: parseOptionalInt(form.connectionAcquisitionTimeout),
      idleTimeout: parseOptionalInt(form.idleTimeout),
      statementTimeout: parseOptionalInt(form.statementTimeout),
      sslRejectUnauthorized: form.sslRejectUnauthorized,
    };
  }

  /** Render a numeric input field for advanced settings. */
  function numericField(
    id: string,
    label: string,
    field: keyof typeof DEFAULT_FORM,
    placeholder: string,
    min: number,
    max?: number,
  ) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="number"
          step={1}
          min={min}
          {...(max !== undefined ? { max } : {})}
          value={form[field] as string}
          onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
          placeholder={placeholder}
        />
      </div>
    );
  }

  function openCreateDialog(type?: "neo4j" | "postgresql") {
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

  function handlePickType(type: "neo4j" | "postgresql") {
    setForm((f) => ({ ...f, type }));
    setDialogStep("fill-form");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
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
        error instanceof Error ? error.message : "Failed to create connection"
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

  async function handleTest(id: string) {
    setTestResults((prev) => ({ ...prev, [id]: "connecting" }));
    setTestErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      const result = await testConnection.mutateAsync(id);
      setTestResults((prev) => ({
        ...prev,
        [id]: result.success ? "connected" : "error",
      }));
      if (!result.success && result.error) {
        setTestErrors((prev) => ({ ...prev, [id]: result.error! }));
      }
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: "error" }));
      setTestErrors((prev) => ({ ...prev, [id]: "Connection test failed" }));
    }
  }

  function handleDuplicate(conn: { name: string; type: "neo4j" | "postgresql" }) {
    setForm({
      ...DEFAULT_FORM,
      type: conn.type,
      name: `${conn.name} (copy)`,
    });
    setDialogStep("fill-form");
    setCreateError(null);
    setInlineTestResult(null);
    setShowCreate(true);
  }

  function getConnectionStatus(id: string): ConnectionState {
    const result = testResults[id];
    if (result === "connecting") return "connecting";
    if (result === "connected") return "connected";
    if (result === "error") return "error";
    return "disconnected";
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Connections"
        description="Manage your database connections"
        actions={
          <Button onClick={() => openCreateDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Connection
          </Button>
        }
      />

      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) closeCreateDialog(); }}>
        <DialogContent>
          {dialogStep === "pick-type" ? (
            <>
              <DialogHeader>
                <DialogTitle>Choose Database Type</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <button
                  data-testid="pick-neo4j"
                  onClick={() => handlePickType("neo4j")}
                  className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-border p-6 text-center transition-colors hover:border-primary hover:bg-accent cursor-pointer"
                >
                  <Neo4jLogo className="h-10 w-10" />
                  <div>
                    <p className="font-semibold">Neo4j</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Graph database</p>
                  </div>
                </button>
                <button
                  data-testid="pick-postgresql"
                  onClick={() => handlePickType("postgresql")}
                  className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-border p-6 text-center transition-colors hover:border-primary hover:bg-accent cursor-pointer"
                >
                  <PostgreSQLLogo className="h-10 w-10" />
                  <div>
                    <p className="font-semibold">PostgreSQL</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Relational database</p>
                  </div>
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>
                  New {form.type === "neo4j" ? "Neo4j" : "PostgreSQL"} Connection
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
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
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    required
                    placeholder="My Database"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="conn-uri">URI</Label>
                  <Input
                    id="conn-uri"
                    value={form.uri}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, uri: e.target.value }))
                    }
                    required
                    placeholder={
                      form.type === "neo4j"
                        ? "bolt://localhost:7687"
                        : "postgresql://localhost:5432"
                    }
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="conn-username">Username</Label>
                    <Input
                      id="conn-username"
                      value={form.username}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, username: e.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="conn-password">Password</Label>
                    <PasswordInput
                      id="conn-password"
                      value={form.password}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="conn-database">
                    Database{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="conn-database"
                    value={form.database}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, database: e.target.value }))
                    }
                  />
                </div>

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
                            {numericField("conn-connection-timeout", "Connection Timeout (ms)", "connectionTimeout", "30000", 0)}
                            {numericField("conn-query-timeout", "Query Timeout (ms)", "queryTimeout", "2000", 0)}
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {numericField("conn-max-pool", "Max Pool Size", "maxPoolSize", "driver default", 1, 100)}
                            {numericField("conn-acquisition-timeout", "Acquisition Timeout (ms)", "connectionAcquisitionTimeout", "driver default", 0)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {numericField("conn-connection-timeout", "Connection Timeout (ms)", "connectionTimeout", "10000", 0)}
                            {numericField("conn-idle-timeout", "Idle Timeout (ms)", "idleTimeout", "10000", 0)}
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {numericField("conn-max-pool", "Max Pool Size", "maxPoolSize", "10", 1, 100)}
                            {numericField("conn-statement-timeout", "Statement Timeout (ms)", "statementTimeout", "30000", 0)}
                          </div>
                          <div className="flex items-center justify-between">
                            <Label htmlFor="conn-ssl-reject">
                              Reject Unauthorized SSL
                            </Label>
                            <Switch
                              id="conn-ssl-reject"
                              checked={form.sslRejectUnauthorized ?? false}
                              onCheckedChange={(checked) =>
                                setForm((f) => ({ ...f, sslRejectUnauthorized: checked }))
                              }
                            />
                          </div>
                        </>
                      )}
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
                <Alert variant={inlineTestResult.success ? "default" : "destructive"}>
                  <AlertDescription>
                    {inlineTestResult.success
                      ? "Connection successful!"
                      : inlineTestResult.error || "Connection failed"}
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter>
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Connection"
        description="This will permanently delete this connection. Any widgets using it will stop working."
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            deleteConnection.mutate(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />

      <div className="mt-6">
        <LoadingOverlay loading={isLoading} text="Loading connections...">
          {!connections?.length ? (
            <EmptyState
              icon={<Database className="h-12 w-12" />}
              title="No connections yet"
              description="Add your first database connection to start querying data."
              action={
                <Button onClick={() => openCreateDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add your first connection
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {connections.map((c) => (
                <ConnectionCard
                  key={c.id}
                  name={c.name}
                  host={c.type}
                  status={getConnectionStatus(c.id)}
                  statusText={testErrors[c.id]}
                  onTest={() => handleTest(c.id)}
                  onDelete={() => setDeleteTarget(c.id)}
                  onDuplicate={() => handleDuplicate(c)}
                />
              ))}
            </div>
          )}
        </LoadingOverlay>
      </div>
    </div>
  );
}
