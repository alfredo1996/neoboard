"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  LoadingButton,
  RadioGroup,
  RadioGroupItem,
} from "@neoboard/components";
import {
  useDashboard,
  useReassignDashboardConnection,
} from "@/hooks/use-dashboards";
import { useConnections } from "@/hooks/use-connections";
import { migrateLayout } from "@/lib/dashboard/migrate-layout";
import { isContentOnlyChartType } from "@/lib/widget/content-only-chart";

/** Sentinel for the "widgets with no connection" bucket. */
export const UNASSIGNED = "";

export interface DashboardConnectionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Pass "" while closed so the dashboard query stays disabled. */
  readonly dashboardId: string;
  readonly dashboardName: string;
}

interface SourceBucket {
  connectionId: string;
  widgetCount: number;
}

/**
 * Group the dashboard's widgets by the connection they reference.
 *
 * Content-only widgets (markdown, iframe) are excluded outright: they carry
 * `connectionId: ""` but never wanted a connection, so counting them would both
 * overstate the unassigned bucket and imply they are about to be rewritten —
 * which the server refuses to do (#1377).
 */
export function bucketWidgetsByConnection(
  layoutJson: Parameters<typeof migrateLayout>[0],
): SourceBucket[] {
  const counts = new Map<string, number>();
  for (const page of migrateLayout(layoutJson).pages) {
    for (const widget of page.widgets) {
      if (isContentOnlyChartType(widget.chartType)) continue;
      const key = widget.connectionId || UNASSIGNED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  // Unassigned last — it is the remedial row, not the common case.
  return [...counts.entries()]
    .map(([connectionId, widgetCount]) => ({ connectionId, widgetCount }))
    .sort((a, b) =>
      a.connectionId === UNASSIGNED
        ? 1
        : b.connectionId === UNASSIGNED
          ? -1
          : a.connectionId.localeCompare(b.connectionId),
    );
}

function pluralWidgets(count: number): string {
  return count === 1 ? "1 widget" : `${count} widgets`;
}

/**
 * Re-point the widgets on one dashboard to a different connection.
 *
 * ONE SOURCE AT A TIME by design: pick a source, pick a target, apply, repeat.
 * A mapping table would need every source resolved before anything could be
 * applied, which is worse for the common case (one wrong connection).
 */
export function DashboardConnectionDialog({
  open,
  onOpenChange,
  dashboardId,
  dashboardName,
}: DashboardConnectionDialogProps) {
  const { data: dashboard, isLoading } = useDashboard(dashboardId);
  const { data: connections = [] } = useConnections();
  const reassign = useReassignDashboardConnection();

  const [source, setSource] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const buckets = useMemo(
    () => bucketWidgetsByConnection(dashboard?.layoutJson),
    [dashboard?.layoutJson],
  );

  const nameOf = (id: string) =>
    connections.find((c) => c.id === id)?.name ?? "Unknown connection";
  const typeOf = (id: string) => connections.find((c) => c.id === id)?.type;

  const sourceType = source ? typeOf(source) : undefined;

  // Same filter the delete-dialog reassign uses: only same-type connections,
  // never the source itself. For the unassigned bucket there is no source type
  // to match — the original connector is unrecoverable after an import — so
  // every connection is offered and the server skips the type check.
  const targets = connections.filter(
    (c) => c.id !== source && (!sourceType || c.type === sourceType),
  );

  const selectedBucket = buckets.find((b) => b.connectionId === source);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSource(null);
      setTarget("");
      setError(null);
      setLastResult(null);
    }
    onOpenChange(next);
  }

  async function handleApply() {
    if (source === null || !target) return;
    setError(null);
    try {
      const result = await reassign.mutateAsync({
        dashboardId,
        fromConnectionId: source,
        targetConnectionId: target,
      });
      setLastResult(
        `Moved ${pluralWidgets(result.widgetsReassigned)} to ${nameOf(target)}.`,
      );
      // Reset the pickers so another source can be fixed without reopening.
      setSource(null);
      setTarget("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change connection.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* #1282: the explanatory copy below already describes this dialog, so
          point at it rather than duplicating it into a DialogDescription —
          two copies of the same sentence would drift. */}
      <DialogContent
        className="sm:max-w-lg"
        aria-describedby="change-connection-desc"
      >
        <DialogHeader>
          <DialogTitle>Change connection</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <p
            id="change-connection-desc"
            className="text-sm text-muted-foreground"
          >
            Re-points widgets on{" "}
            <span className="font-medium text-foreground">{dashboardName}</span>{" "}
            only. Other dashboards using the same connection are not affected.
          </p>

          {lastResult && (
            <Alert>
              <AlertDescription>{lastResult}</AlertDescription>
            </Alert>
          )}

          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading widgets…</p>
          )}

          {!isLoading && buckets.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This dashboard has no widgets that use a connection.
            </p>
          )}

          {buckets.length > 0 && (
            <div className="space-y-2">
              <Label>Move widgets from</Label>
              <RadioGroup
                value={source ?? undefined}
                onValueChange={(v: string) => {
                  setSource(v);
                  setTarget("");
                  setError(null);
                }}
              >
                {buckets.map((b) => {
                  const id = `reassign-source-${b.connectionId || "unassigned"}`;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <RadioGroupItem value={b.connectionId} id={id} />
                      <Label
                        htmlFor={id}
                        className="flex-1 cursor-pointer font-normal"
                      >
                        {b.connectionId === UNASSIGNED
                          ? "Unassigned"
                          : nameOf(b.connectionId)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {pluralWidgets(b.widgetCount)}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          )}

          {source !== null && (
            <div className="space-y-2">
              <Label htmlFor="reassign-dashboard-target">To</Label>
              {targets.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No other {sourceType ?? ""} connections available. Create
                    one first.
                  </AlertDescription>
                </Alert>
              ) : (
                <select
                  id="reassign-dashboard-target"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Select a connection…</option>
                  {targets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {selectedBucket && target && (
            <p className="text-sm text-muted-foreground">
              This will change {pluralWidgets(selectedBucket.widgetCount)} on{" "}
              {dashboardName}. Widget queries are not checked against the target
              — incompatible queries will show their usual error.
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Done
          </Button>
          <LoadingButton
            type="button"
            loading={reassign.isPending}
            loadingText="Changing…"
            disabled={source === null || !target || reassign.isPending}
            onClick={handleApply}
          >
            Change connection
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
