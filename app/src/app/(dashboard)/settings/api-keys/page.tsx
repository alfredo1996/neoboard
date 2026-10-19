"use client";

import {
  useRef,
  useState,
  type MouseEventHandler,
  type RefObject,
} from "react";
import { Plus, Copy, Check, Key, MoreHorizontal } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  focusedMenuTrigger,
  TimeAgo,
  Input,
  EmptyState,
  Field,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@neoboard/components";
import { List, ListRow, PageHeader } from "@neoboard/components/kit";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "@/hooks/use-api-keys";
import type { ApiKeyListItem, CreatedApiKey } from "@/hooks/use-api-keys";
import { returnFocus } from "@/lib/return-focus";
import { formatShortDate } from "../../users/user-list";
import { SettingsTabs } from "../settings-tabs";
import { useSettingsCrumb } from "../settings-crumb";
import { maskedKey } from "./masked-key";

const COLUMNS = ["Name", "Key", "Created", "Expires"];

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
  onCloseAutoFocus,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onCloseAutoFocus: () => void;
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
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>
            {createdKey ? "API key created" : "Create API key"}
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
              {/* Keep the 66-char token on one line — horizontal scroll
                  instead of break-all, which wrapped mid-token (#1038). */}
              <span className="flex-1 overflow-x-auto whitespace-nowrap">
                {createdKey.key}
              </span>
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
            <Field label="Name" id="key-name">
              <Input
                placeholder="e.g. CI/CD pipeline"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Expires at" id="key-expires" optional>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </Field>
            {createMutation.error && (
              <p className="text-sm text-destructive">
                {createMutation.error.message}
              </p>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Generating..." : "Generate key"}
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
  heading,
}: Readonly<{
  apiKey: ApiKeyListItem;
  onRevoke: (id: string) => void;
  heading: RefObject<HTMLHeadingElement | null>;
}>) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Where focus goes on close: the dialog has no Trigger (#2086).
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);

  return (
    <ListRow
      title={apiKey.name}
      description={
        apiKey.lastUsedAt ? (
          <>
            Last used <TimeAgo date={apiKey.lastUsedAt} className="text-xs" />
          </>
        ) : (
          "Never used"
        )
      }
      meta={[
        <span key="key" className="font-mono">
          {maskedKey(apiKey.keyPrefix)}
        </span>,
        formatShortDate(apiKey.createdAt),
        formatShortDate(apiKey.expiresAt),
      ]}
      menu={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Key actions for ${apiKey.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  setReturnFocusTo(focusedMenuTrigger());
                  setConfirmOpen(true);
                }}
              >
                Revoke
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Revoke API key"
            description={`Are you sure you want to revoke "${apiKey.name}"? This action cannot be undone. Any integrations using this key will stop working immediately.`}
            confirmText="Revoke"
            variant="destructive"
            returnFocusTo={returnFocusTo}
            onConfirm={() => {
              // The row leaves once the list refetches: land on the heading.
              setReturnFocusTo(heading.current);
              onRevoke(apiKey.id);
              setConfirmOpen(false);
            }}
          />
        </>
      }
    />
  );
}

export default function ApiKeysPage() {
  const [createOpen, setCreateOpen] = useState(false);
  // The dialog has no Trigger: where focus goes when it closes (#2146).
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);
  const { data: keys = [], isLoading } = useApiKeys();
  const revokeMutation = useRevokeApiKey();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const handleRevoke = (id: string) => {
    revokeMutation.mutate(id);
  };

  const openCreate: MouseEventHandler<HTMLButtonElement> = (e) => {
    setReturnFocusTo(e.currentTarget);
    setCreateOpen(true);
  };

  const createButton = (
    <Button onClick={openCreate}>
      <Plus className="mr-2 h-4 w-4" />
      Create API key
    </Button>
  );
  const base = "Programmatic access to this workspace";
  const count = `${keys.length} ${keys.length === 1 ? "key" : "keys"}`;
  const meta = keys.length > 0 ? `${base} · ${count}` : base;
  const settingsCrumb = useSettingsCrumb();

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        breadcrumb={[settingsCrumb, { label: "API keys" }]}
        title="API keys"
        titleRef={headingRef}
        meta={meta}
        actions={createButton}
        tabs={<SettingsTabs />}
      />

      <div className="flex-1 space-y-4 bg-page-ground p-4 md:p-7">
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
            action={createButton}
          />
        )}

        {!isLoading && keys.length > 0 && (
          <List label="API keys" columns={COLUMNS}>
            {keys.map((key) => (
              <ApiKeyRow
                key={key.id}
                apiKey={key}
                onRevoke={handleRevoke}
                heading={headingRef}
              />
            ))}
          </List>
        )}
      </div>

      <CreateKeyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCloseAutoFocus={() => returnFocus(returnFocusTo, headingRef.current)}
      />
    </div>
  );
}
