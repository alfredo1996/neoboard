"use client";

import { useRef, useState } from "react";
import { Plus, Trash2, Copy, Check, Key } from "lucide-react";
import {
  PageHeader,
  Button,
  Input,
  EmptyState,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@neoboard/components";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/use-api-keys";
import type { ApiKeyListItem, CreatedApiKey } from "@/hooks/use-api-keys";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CopyButton({ value }: Readonly<{ value: string }>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 rounded p-1 hover:bg-muted"
      aria-label="Copy API key"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}

function CreateKeyDialog({
  open,
  onClose,
}: Readonly<{
  open: boolean;
  onClose: () => void;
}>) {
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const createMutation = useCreateApiKey();
  const closedRef = useRef(false);

  const handleCreate = async () => {
    closedRef.current = false;
    const result = await createMutation.mutateAsync({
      name,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });
    // Guard against late response after dialog was closed
    if (!closedRef.current) {
      setCreatedKey(result);
    }
  };

  const handleClose = () => {
    closedRef.current = true;
    setName("");
    setExpiresAt("");
    setCreatedKey(null);
    createMutation.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {createdKey ? "API Key Created" : "Create API Key"}
          </DialogTitle>
        </DialogHeader>

        {createdKey ? (
          <div className="space-y-4">
            <DialogDescription className="text-amber-600 dark:text-amber-400 font-medium">
              Copy this key now. It will not be shown again.
            </DialogDescription>
            <div
              className="flex items-center rounded-md border bg-muted px-3 py-2 font-mono text-sm"
              data-testid="api-key-display"
            >
              <span className="flex-1 break-all">{createdKey.key}</span>
              <CopyButton value={createdKey.key} />
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <DialogDescription className="sr-only">
              Enter a name and optional expiry date for your new API key.
            </DialogDescription>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="key-name">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="key-name"
                placeholder="e.g. CI/CD pipeline"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="key-expires">
                Expires at <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="key-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            {createMutation.error && (
              <p className="text-sm text-destructive">{createMutation.error.message}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Generating..." : "Generate Key"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApiKeyRow({
  apiKey,
  onRevoke,
}: Readonly<{
  apiKey: ApiKeyListItem;
  onRevoke: (id: string) => void;
}>) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-3 font-medium text-sm whitespace-nowrap">{apiKey.name}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {formatDate(apiKey.createdAt)}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {formatDate(apiKey.lastUsedAt)}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {formatDate(apiKey.expiresAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
          aria-label={`Revoke ${apiKey.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Revoke API Key"
          description={`Are you sure you want to revoke "${apiKey.name}"? This action cannot be undone. Any integrations using this key will stop working immediately.`}
          confirmText="Revoke"
          variant="destructive"
          onConfirm={() => {
            onRevoke(apiKey.id);
            setConfirmOpen(false);
          }}
        />
      </td>
    </tr>
  );
}

export default function ApiKeysPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: keys = [], isLoading } = useApiKeys();
  const revokeMutation = useRevokeApiKey();

  const handleRevoke = (id: string) => {
    revokeMutation.mutate(id);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="API Keys"
        description="Manage API keys for programmatic access to NeoBoard."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create API Key
          </Button>
        }
      />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {!isLoading && keys.length === 0 && (
        <EmptyState
          icon={<Key className="h-8 w-8 text-muted-foreground" />}
          title="No API keys"
          description="Create an API key to make programmatic requests to NeoBoard."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          }
        />
      )}

      {!isLoading && keys.length > 0 && (
        <div className="rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Last Used
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Expires
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <ApiKeyRow key={key.id} apiKey={key} onRevoke={handleRevoke} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateKeyDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
