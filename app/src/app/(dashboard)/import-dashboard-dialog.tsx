"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  LoadingButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@neoboard/components";
import { useConnections } from "@/hooks/use-connections";
import { useImportDashboard } from "@/hooks/use-dashboards";
import {
  collectNeoDashDatabases,
  isNeoDashFormat,
} from "@/lib/dashboard/neodash-converter";

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
  /** NeoDash database names found in the payload (one mapping row per entry).
   *  Empty string represents "no database specified" for those reports. */
  neodashDatabases: string[];
}

interface ImportDashboardDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function ImportDashboardDialog({
  open,
  onOpenChange,
}: ImportDashboardDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);

  const { data: availableConnections = [] } = useConnections();
  const importDashboard = useImportDashboard();

  const neo4jConnections = availableConnections.filter(
    (c) => c.type === "neo4j",
  );

  // Auto-pick the single Neo4j connection for any NeoDash database the user
  // hasn't explicitly mapped. Derived during render so the auto-pick still
  // applies if useConnections() resolves after the file was uploaded — without
  // this the dialog would freeze on a disabled submit until the user touched
  // the picker.
  const effectiveMapping = useMemo(() => {
    if (!parsed?.isNeoDash || neo4jConnections.length !== 1) return mapping;
    const onlyId = neo4jConnections[0].id;
    const next: Record<string, string> = { ...mapping };
    for (const db of parsed.neodashDatabases) {
      if (!next[db]) next[db] = onlyId;
    }
    return next;
  }, [mapping, parsed, neo4jConnections]);

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
        const widgetCount =
          (json.pages as Array<{ reports?: unknown[] }>)?.reduce(
            (sum: number, p) => sum + (p.reports?.length ?? 0),
            0,
          ) ?? 0;
        const databases = collectNeoDashDatabases(json);
        const neo4jConnections = availableConnections.filter(
          (c) => c.type === "neo4j",
        );
        // Pre-pick every row when there's exactly one Neo4j connection.
        const defaultId =
          neo4jConnections.length === 1 ? neo4jConnections[0].id : "";
        const initialMapping: Record<string, string> = {};
        for (const db of databases) {
          initialMapping[db] = defaultId;
        }
        setMapping(initialMapping);
        setParsed({
          payload: json,
          dashboardName:
            (json as { title?: string }).title ?? "Imported Dashboard",
          widgetCount: widgetCount,
          isNeoDash: true,
          connections: {},
          neodashDatabases: databases,
        });
      } else if (json.formatVersion === 1) {
        const connections = (json.connections ?? {}) as Record<
          string,
          ConnectionInfo
        >;
        const widgetCount =
          (json.layout?.pages as Array<{ widgets?: unknown[] }>)?.reduce(
            (sum: number, p) => sum + (p.widgets?.length ?? 0),
            0,
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
          neodashDatabases: [],
        });
      } else {
        setFileError(
          "Unrecognised file format. Expected a NeoBoard or NeoDash export.",
        );
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
        connectionMapping: effectiveMapping,
      });
      handleOpenChange(false);
      router.push(`/${result.id}`);
    } catch (error) {
      setFileError(
        error instanceof Error ? error.message : "Failed to import dashboard.",
      );
    }
  }

  const hasConnections =
    parsed && !parsed.isNeoDash && Object.keys(parsed.connections).length > 0;
  const needsNeoDashConnection = parsed?.isNeoDash === true;
  const allMapped =
    (!hasConnections && !needsNeoDashConnection) ||
    Object.values(effectiveMapping).every((v) => v !== "");

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
                <p className="text-sm font-medium truncate">
                  {parsed.dashboardName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {parsed.widgetCount} widget
                  {parsed.widgetCount === 1 ? "" : "s"}
                  {parsed.isNeoDash
                    ? " · NeoDash format"
                    : " · NeoBoard format"}
                </p>
              </div>
            )}

            {needsNeoDashConnection && (
              <div className="space-y-3">
                {neo4jConnections.length === 0 ? (
                  <>
                    <Label>Neo4j connection</Label>
                    <p className="text-sm text-muted-foreground">
                      NeoDash dashboards run on Neo4j. You don&apos;t have a
                      Neo4j connection yet —{" "}
                      <Link
                        href="/connections"
                        className="text-primary underline"
                      >
                        add a connection
                      </Link>{" "}
                      to continue.
                    </p>
                  </>
                ) : parsed.neodashDatabases.length === 1 ? (
                  <>
                    <Label htmlFor="neodash-connection">Neo4j connection</Label>
                    <p className="text-xs text-muted-foreground">
                      All widgets in this dashboard will use the selected
                      connection.
                    </p>
                    <Select
                      value={effectiveMapping[parsed.neodashDatabases[0]] ?? ""}
                      onValueChange={(val) =>
                        setMapping({ [parsed.neodashDatabases[0]]: val })
                      }
                    >
                      <SelectTrigger id="neodash-connection">
                        <SelectValue placeholder="Select Neo4j connection" />
                      </SelectTrigger>
                      <SelectContent>
                        {neo4jConnections.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <Label>Map NeoDash databases to connections</Label>
                    <p className="text-xs text-muted-foreground">
                      This dashboard references {parsed.neodashDatabases.length}{" "}
                      databases. Pick a Neo4j connection for each. Widgets keep
                      their per-card database so one connection can serve
                      multiple databases.
                    </p>
                    {parsed.neodashDatabases.map((db) => (
                      <div
                        key={db || "__default__"}
                        className="grid grid-cols-2 gap-2 items-center"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-mono truncate">
                            {db || "Default database"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {db
                              ? "NeoDash database name"
                              : "Reports with no database set"}
                          </p>
                        </div>
                        <Select
                          value={effectiveMapping[db] ?? ""}
                          onValueChange={(val) =>
                            setMapping((prev) => ({ ...prev, [db]: val }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Neo4j connection" />
                          </SelectTrigger>
                          <SelectContent>
                            {neo4jConnections.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {hasConnections && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Map each connection placeholder to a local connection:
                </p>
                {Object.entries(parsed.connections).map(([key, info]) => {
                  const compatible = availableConnections.filter(
                    (c) => c.type === info.type,
                  );
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-2 gap-2 items-center"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {info.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {info.type}
                        </p>
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
