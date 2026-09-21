"use client";

import { useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingButton,
} from "@neoboard/components";
import type { ConnectorDescriptor } from "@neoboard/connection";
import { ConnectorConfigForm } from "@/components/connector-config-form";
import { ConnectorTypePicker } from "@/components/connector-type-picker";
import { useConnectors } from "@/hooks/use-connectors";
import {
  type ConnectionConfigInput,
  useConnectionConfig,
  useCreateConnection,
  useTestInlineConnection,
  useUpdateConnection,
} from "@/hooks/use-connections";
import { hintForConnectionErrorCode } from "@/lib/connector/connection-error-classifier";
import {
  EMPTY_CONNECTION_FORM,
  configToForm,
  connectionFormErrors,
  formToConfig,
  hasFormErrors,
  maxRowsOf,
  type ConnectionFormErrors,
  type ConnectionFormState,
} from "@/lib/connector/connection-form";

/** What the dialog is open for. `null` closes it. */
export type ConnectionDialogTarget =
  | {
      mode: "create";
      /** Skips the type picker — set by Duplicate. */
      type?: string;
      /** Duplicate: the connection whose non-secret config pre-fills the copy. */
      prefillFrom?: { id: string; name: string };
    }
  | { mode: "edit"; id: string; name: string; type: string };

interface ConnectionDialogProps {
  readonly target: ConnectionDialogTarget | null;
  readonly onClose: () => void;
  /** The connection was created or updated; the page tests it afterwards. */
  readonly onSaved: (id: string) => void;
}

type InlineTestResult = Awaited<
  ReturnType<ReturnType<typeof useTestInlineConnection>["mutateAsync"]>
>;

const BODY = "min-h-0 flex-1 space-y-4 overflow-y-auto py-4";

function initialName(target: ConnectionDialogTarget): string {
  if (target.mode === "edit") return target.name;
  return target.prefillFrom ? `${target.prefillFrom.name} (copy)` : "";
}

function Header({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
  );
}

function TestResult({
  result,
  connector,
}: Readonly<{ result: InlineTestResult; connector: ConnectorDescriptor }>) {
  if (result.success) {
    return (
      <Alert>
        <AlertDescription>Connection successful!</AlertDescription>
      </Alert>
    );
  }
  const hint =
    result.code && result.code !== "unknown"
      ? // The descriptor carries the example the hint quotes (#1903): the
        // connector's own URI or username placeholder, rather than a generic
        // sentence. Without it the hint silently loses that half.
        hintForConnectionErrorCode(result.code, connector)
      : null;
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <div>{result.error || "Connection failed"}</div>
        {hint && <div className="mt-1 text-sm opacity-90">{hint}</div>}
      </AlertDescription>
    </Alert>
  );
}

interface FormStepProps {
  readonly target: ConnectionDialogTarget;
  readonly connector: ConnectorDescriptor;
  readonly initial: ConnectionFormState;
  readonly onChangeType?: () => void;
  readonly onClose: () => void;
  readonly onSaved: (id: string) => void;
}

/**
 * The form step, for create and edit alike: one `ConnectorConfigForm`, the
 * same inline validation (`validateConfig`, which the server repeats), one
 * save. Create adds the inline test; edit sends no secret it was not given.
 */
function FormStep({
  target,
  connector,
  initial,
  onChangeType,
  onClose,
  onSaved,
}: FormStepProps) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<ConnectionFormErrors>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<InlineTestResult | null>(null);
  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const testInline = useTestInlineConnection();
  const isEdit = target.mode === "edit";

  // Blank values are left out: for a secret in edit that is what tells the
  // server to keep the stored one.
  const config: ConnectionConfigInput = {
    ...formToConfig(connector.fields, form.config),
    maxRows: maxRowsOf(form),
  };
  const requiredMissing = connector.fields.some(
    (field) => field.required && config[field.key] === undefined,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const found = connectionFormErrors(connector, form, target.mode);
    setErrors(found);
    if (hasFormErrors(found)) return;
    try {
      const saved =
        target.mode === "edit"
          ? await updateConnection.mutateAsync({
              id: target.id,
              name: form.name.trim(),
              config,
            })
          : await createConnection.mutateAsync({
              name: form.name.trim(),
              // The cast goes when #1900 opens `string` to string.
              type: connector.type,
              config,
            });
      onSaved(saved.id);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save connection",
      );
    }
  }

  async function handleTestInline() {
    setTestResult(null);
    const found = connectionFormErrors(connector, form, target.mode);
    // A test needs a valid config, not a name.
    if (Object.keys(found.config).length > 0 || found.own.maxRows) {
      setErrors(found);
      return;
    }
    try {
      setTestResult(
        await testInline.mutateAsync({
          type: connector.type,
          config,
        }),
      );
    } catch {
      setTestResult({ success: false, error: "Connection test failed" });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex min-h-0 flex-col overflow-hidden"
    >
      {isEdit ? (
        <Header
          title={`Edit ${target.name}`}
          description="Update the settings for this connection. Leave a password or other secret blank to keep the stored one."
        />
      ) : (
        <Header
          title={`New ${connector.label} Connection`}
          description="Enter the host, credentials and options for this connection. Credentials are encrypted before they're stored."
        />
      )}
      <div className={BODY}>
        {onChangeType && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={onChangeType}
          >
            ← Change type
          </Button>
        )}
        <ConnectorConfigForm
          connector={connector}
          mode={target.mode}
          value={form}
          onChange={setForm}
          errors={errors}
        />
      </div>
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}
      {testResult && <TestResult result={testResult} connector={connector} />}
      <DialogFooter className="mt-4 shrink-0 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {!isEdit && (
          <LoadingButton
            type="button"
            variant="secondary"
            loading={testInline.isPending}
            loadingText="Testing..."
            disabled={requiredMissing}
            onClick={handleTestInline}
          >
            Test Connection
          </LoadingButton>
        )}
        <LoadingButton
          type="submit"
          loading={createConnection.isPending || updateConnection.isPending}
          loadingText={isEdit ? "Saving..." : "Creating..."}
        >
          {isEdit ? "Save" : "Create"}
        </LoadingButton>
      </DialogFooter>
    </form>
  );
}

/** Shown in place of the form while it cannot be built, with a way out. */
function PendingStep({
  title,
  description,
  onClose,
  children,
}: Readonly<{
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header title={title} description={description} />
      <div className={BODY}>{children}</div>
      <DialogFooter className="mt-4 shrink-0 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  );
}

function DialogSteps({
  target,
  onClose,
  onSaved,
}: Readonly<{
  target: ConnectionDialogTarget;
  onClose: () => void;
  onSaved: (id: string) => void;
}>) {
  const connectorsQuery = useConnectors();
  const [type, setType] = useState(target.type);
  // Edit and Duplicate pre-fill from the stored config — which the server
  // hands out without any of its secrets.
  const stored = useConnectionConfig(
    target.mode === "edit" ? target.id : target.prefillFrom?.id,
  );
  const connector = connectorsQuery.data?.find((c) => c.type === type);
  const title =
    target.mode === "edit" ? `Edit ${target.name}` : "New Connection";

  if (!type) {
    return (
      <>
        <Header
          title="Choose Connection Type"
          description="Select what this connection points at. You'll configure its details next."
        />
        <ConnectorTypePicker
          connectors={connectorsQuery.data}
          isLoading={connectorsQuery.isLoading}
          isError={connectorsQuery.isError}
          onRetry={() => connectorsQuery.refetch()}
          onPick={setType}
        />
      </>
    );
  }
  if (connectorsQuery.isLoading || stored.isLoading) {
    return (
      <PendingStep
        title={title}
        description="Loading this connection's settings."
        onClose={onClose}
      >
        <output
          aria-label="Loading"
          className="flex items-center justify-center py-8"
        >
          <span className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </output>
      </PendingStep>
    );
  }
  if (!connector) {
    // The form IS the descriptor: without it there is nothing to guess at.
    return (
      <PendingStep
        title={title}
        description="The form is built from the connector's own definition."
        onClose={onClose}
      >
        <Alert variant="destructive">
          <AlertDescription>
            This connector&apos;s settings could not be loaded.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => connectorsQuery.refetch()}>
          Try again
        </Button>
      </PendingStep>
    );
  }
  return (
    <FormStep
      target={target}
      connector={connector}
      initial={{
        ...(stored.data
          ? configToForm(connector.fields, stored.data)
          : EMPTY_CONNECTION_FORM),
        name: initialName(target),
      }}
      onChangeType={
        target.mode === "create" ? () => setType(undefined) : undefined
      }
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

/**
 * Add, edit or duplicate a connection (#1901) — one dialog, because all three
 * are the same generated form around a different starting point. Each opening
 * mounts fresh state, so nothing typed into one connection's dialog (least of
 * all a secret) is still there when another's opens.
 */
export function ConnectionDialog({
  target,
  onClose,
  onSaved,
}: ConnectionDialogProps) {
  // The last target stays rendered while the dialog animates shut; each new
  // opening gets a new key, and with it fresh state.
  const [shown, setShown] = useState({ target, opening: 0 });
  if (target && target !== shown.target) {
    setShown({ target, opening: shown.opening + 1 });
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex flex-col overflow-hidden">
        {shown.target && (
          <DialogSteps
            key={shown.opening}
            target={shown.target}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
