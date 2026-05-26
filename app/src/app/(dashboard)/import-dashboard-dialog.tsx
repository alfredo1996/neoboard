"use client";

import { useRef, useState } from "react";
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
import { isNeoDashFormat } from "@/lib/dashboard/neodash-converter";

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
        const neo4jConnections = availableConnections.filter(
          (c) => c.type === "neo4j",
        );
        // Pre-select when there's exactly one Neo4j connection.
        const defaultId =
          neo4jConnections.length === 1 ? neo4jConnections[0].id : "";
        setMapping({ "": defaultId });
        setParsed({
          payload: json,
          dashboardName:
            (json as { title?: string }).title ?? "Imported Dashboard",
          widgetCount: widgetCount,
          isNeoDash: true,
          connections: {},
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
        connectionMapping: mapping,
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
  const neo4jConnections = availableConnections.filter(
    (c) => c.type === "neo4j",
  );
  const needsNeoDashConnection = parsed?.isNeoDash === true;
  const allMapped =
    (!hasConnections && !needsNeoDashConnection) ||
    Object.values(mapping).every((v) => v !== "");

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
                <Label htmlFor="neodash-connection">Neo4j connection</Label>
                {neo4jConnections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    NeoDash dashboards run on Neo4j. You don&apos;t have a Neo4j
                    connection yet —{" "}
                    <Link
                      href="/connections"
                      className="text-primary underline"
                    >
                      add a connection
                    </Link>{" "}
                    to continue.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      All widgets in this dashboard will use the selected
                      connection.
                    </p>
                    <Select
                      value={mapping[""] ?? ""}
                      onValueChange={(val) => setMapping({ "": val })}
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
