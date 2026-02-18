"use client";

import { useState, useEffect, useRef } from "react";
import { Database, Plus } from "lucide-react";
import {
  useConnections,
  useCreateConnection,
  useDeleteConnection,
  useTestConnection,
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
  ConnectionCard,
  PasswordInput,
} from "@neoboard/components";
import type { ConnectionState } from "@neoboard/components";

export default function ConnectionsPage() {
  const { data: connections, isLoading } = useConnections();
  const createConnection = useCreateConnection();
  const deleteConnection = useDeleteConnection();
  const testConnection = useTestConnection();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "neo4j" as "neo4j" | "postgresql",
    uri: "",
    username: "",
    password: "",
    database: "",
  });
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createConnection.mutateAsync({
      name: form.name,
      type: form.type,
      config: {
        uri: form.uri,
        username: form.username,
        password: form.password,
        database: form.database || undefined,
      },
    });
    setForm({
      name: "",
      type: "neo4j",
      uri: "",
      username: "",
      password: "",
      database: "",
    });
    setShowCreate(false);
  }

  async function handleTest(id: string) {
    setTestResults((prev) => ({ ...prev, [id]: "connecting" }));
    const result = await testConnection.mutateAsync(id);
    setTestResults((prev) => ({
      ...prev,
      [id]: result.success ? "connected" : "error",
    }));
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
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Connection
          </Button>
        }
      />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>New Connection</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
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
                  <Label>Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        type: v as "neo4j" | "postgresql",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="neo4j">Neo4j</SelectItem>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                loading={createConnection.isPending}
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
                <Button onClick={() => setShowCreate(true)}>
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
                  onTest={() => handleTest(c.id)}
                  onDelete={() => setDeleteTarget(c.id)}
                />
              ))}
            </div>
          )}
        </LoadingOverlay>
      </div>
    </div>
  );
}
