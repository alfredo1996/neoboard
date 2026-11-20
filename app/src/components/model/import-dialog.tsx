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
  Field,
  Input,
  LoadingButton,
  controlSizes,
  fieldBaseClasses,
  useToast,
} from "@neoboard/components";
import {
  useImportOntology,
  type OntologyImportResult,
} from "@/hooks/use-ontology-transfer";

export interface ImportConnection {
  readonly id: string;
  readonly name: string;
}

interface FileConnection {
  id: string;
  name: string;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const selectClass = `${fieldBaseClasses} ${controlSizes.default}`;

/** The connections a file names, or why it is not an ontology file. */
function readFile(text: string): { payload: unknown; list: FileConnection[] } {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON");
  }
  const f = payload as { format?: unknown; connections?: unknown } | null;
  if (f?.format !== "neoboard-ontology" || !Array.isArray(f.connections)) {
    throw new Error("This is not a NeoBoard ontology file");
  }
  const list = (f.connections as FileConnection[]).map((c) => ({
    id: c.id,
    name: typeof c.name === "string" ? c.name : "",
  }));
  return { payload, list };
}

/** Each file connection paired with the local one of the same name, else skipped. */
export function prefillMapping(
  list: readonly FileConnection[],
  local: readonly ImportConnection[],
): Record<string, string> {
  return Object.fromEntries(
    list.map((c) => [c.id, local.find((l) => l.name === c.name)?.id ?? ""]),
  );
}

function Summary({ result }: Readonly<{ result: OntologyImportResult }>) {
  const { terms, concepts, items } = result.preview;
  const stats = [
    ["New", terms.new + concepts.new],
    ["Changed", terms.changed + concepts.changed],
    ["No longer in the database", terms.orphaned + concepts.orphaned],
    ["Skipped", terms.skipped + concepts.skipped + concepts.skippedSides],
  ] as const;
  return (
    <div className="min-w-0 space-y-3">
      <dl className="grid grid-cols-4 gap-2" data-testid="import-counts">
        {stats.map(([label, n]) => (
          <div key={label} className="rounded-md border p-2">
            <dd className="text-lg font-semibold">{n}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      {items.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-auto text-sm">
          {items.map((i) => (
            <li key={`${i.kind}-${i.label}`} className="flex gap-2">
              <span className="w-16 shrink-0 text-xs uppercase text-muted-foreground">
                {i.status}
              </span>
              <span className="min-w-0 truncate">
                {i.label}
                {i.orphaned && " (no longer in the database)"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing to change.</p>
      )}
    </div>
  );
}

/**
 * Imports an ontology file (#2510): pick it, pair each connection in it with
 * one here (prefilled by name; one left unpaired is skipped), look at what
 * would change, then confirm. The page hides the button from readers and the
 * route refuses them.
 */
export function ImportDialog({
  open,
  onOpenChange,
  connections,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: readonly ImportConnection[];
}>) {
  const { toast } = useToast();
  const run = useImportOntology();
  const [file, setFile] = useState<{
    payload: unknown;
    list: FileConnection[];
  } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<OntologyImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setFile(null);
      setPreview(null);
      setError(null);
      run.reset();
    }
    onOpenChange(next);
  };

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setPreview(null);
    setError(null);
    setFile(null);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setError("This file is larger than 10 MB");
      return;
    }
    try {
      const read = readFile(await f.text());
      setFile(read);
      setMapping(prefillMapping(read.list, connections));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file");
    }
  };

  const send = async (apply: boolean) => {
    if (!file) return;
    setError(null);
    try {
      const result = await run.mutateAsync({
        payload: file.payload,
        connectionMapping: Object.fromEntries(
          Object.entries(mapping).filter(([, to]) => to),
        ),
        apply,
      });
      if (apply) {
        toast({ title: "Model imported" });
        close(false);
      } else {
        setPreview(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import model</DialogTitle>
          <DialogDescription>
            Load descriptions and concepts from a model file. The file wins for
            what it holds; nothing else is deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4 py-4">
          {preview ? (
            <Summary result={preview} />
          ) : (
            <>
              <Field label="Model file (.json)" id="ontology-file">
                <Input type="file" accept=".json" onChange={pick} />
              </Field>
              {file && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Pair each connection in the file with one here. One left
                    unpaired is skipped.
                  </p>
                  {file.list.map((c) => (
                    <div key={c.id} className="space-y-1.5">
                      <p className="text-[13px] font-medium">
                        {c.name || c.id}
                      </p>
                      <select
                        aria-label={c.name || c.id}
                        className={selectClass}
                        value={mapping[c.id] ?? ""}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [c.id]: e.target.value }))
                        }
                      >
                        <option value="">Skip this connection</option>
                        {connections.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          {preview ? (
            <>
              <Button variant="secondary" onClick={() => setPreview(null)}>
                Back
              </Button>
              <LoadingButton
                loading={run.isPending}
                loadingText="Importing..."
                onClick={() => send(true)}
              >
                Confirm
              </LoadingButton>
            </>
          ) : (
            <LoadingButton
              loading={run.isPending}
              loadingText="Reading..."
              disabled={!file}
              onClick={() => send(false)}
            >
              Preview
            </LoadingButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
