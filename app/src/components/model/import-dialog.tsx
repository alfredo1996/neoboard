"use client";

import { useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  LoadingButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  // The server's file rules: an id and a name that are strings, the id not empty.
  const valid = f.connections.every(
    (c) =>
      c !== null &&
      typeof c === "object" &&
      typeof c.id === "string" &&
      c.id !== "" &&
      typeof c.name === "string",
  );
  if (!valid) throw new Error("This is not a NeoBoard ontology file");
  const list = (f.connections as FileConnection[]).map((c) => ({
    id: c.id,
    name: c.name,
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
  const { terms, concepts, items, skipped } = result.preview;
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
          <div
            key={label}
            className="flex flex-col-reverse rounded-md border p-2"
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{n}</dd>
          </div>
        ))}
      </dl>
      {items.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-auto text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-baseline gap-2">
              <span className="w-16 shrink-0 text-xs uppercase text-muted-foreground">
                {i.status}
              </span>
              <span className="min-w-0 break-words">{i.label}</span>
              {i.orphaned && (
                <span className="shrink-0 rounded-sm bg-muted px-1.5 text-xs text-muted-foreground">
                  no longer in the database
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing to change.</p>
      )}
      {skipped.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Skipped</p>
          <ul
            className="max-h-32 space-y-1 overflow-auto text-sm"
            data-testid="import-skipped"
          >
            {skipped.map((s) => (
              <li key={`${s.kind}|${s.label}`} className="break-words">
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Imports an ontology file (#2510): pick it, pair each connection in it with
 * one here (prefilled by name; one marked Skip is left out), look at what
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
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  // The preview with the exact input it was made from: Confirm applies that.
  const [preview, setPreview] = useState<{
    result: OntologyImportResult;
    input: { payload: unknown; connectionMapping: Record<string, string> };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by anything that changes the input; a response for an older one is dropped.
  const generation = useRef(0);
  const invalidate = () => {
    generation.current++;
    setPreview(null);
  };

  const close = (next: boolean) => {
    if (!next) {
      generation.current++;
      setFile(null);
      setPreview(null);
      setError(null);
      run.reset();
    }
    onOpenChange(next);
  };

  const toggleSkip = (id: string) => {
    invalidate();
    setSkipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    invalidate();
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
      const prefilled = prefillMapping(read.list, connections);
      setMapping(prefilled);
      setSkipped(
        new Set(
          Object.entries(prefilled)
            .filter(([, to]) => !to)
            .map(([id]) => id),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file");
    }
  };

  const send = async (apply: boolean) => {
    const input = apply
      ? preview?.input
      : file && {
          payload: file.payload,
          connectionMapping: Object.fromEntries(
            Object.entries(mapping).filter(
              ([id, to]) => to && !skipped.has(id),
            ),
          ),
        };
    if (!input) return;
    const mine = generation.current;
    setError(null);
    try {
      const result = await run.mutateAsync({ ...input, apply });
      if (mine !== generation.current) return;
      if (apply) {
        toast({ title: "Model imported" });
        close(false);
      } else {
        setPreview({ result, input });
      }
    } catch (err) {
      if (mine !== generation.current) return;
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
            <Summary result={preview.result} />
          ) : (
            <>
              <Field label="Model file (.json)" id="ontology-file">
                <Input type="file" accept=".json" onChange={pick} />
              </Field>
              {file && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Pair each connection in the file with one here, or check
                    &ldquo;Skip&rdquo; to leave it out.
                  </p>
                  {file.list.map((c) => (
                    <div
                      key={c.id}
                      className="space-y-2 rounded-md border bg-card p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">
                          {c.name || c.id}
                        </p>
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                          <Checkbox
                            aria-label={`Skip ${c.name || c.id}`}
                            checked={skipped.has(c.id)}
                            onCheckedChange={() => toggleSkip(c.id)}
                          />
                          Skip
                        </label>
                      </div>
                      {!skipped.has(c.id) && (
                        <Select
                          value={mapping[c.id] ?? ""}
                          onValueChange={(val) => {
                            invalidate();
                            setMapping((m) => ({ ...m, [c.id]: val }));
                          }}
                        >
                          <SelectTrigger aria-label={c.name || c.id}>
                            <SelectValue placeholder="Select connection" />
                          </SelectTrigger>
                          <SelectContent>
                            {connections.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
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
