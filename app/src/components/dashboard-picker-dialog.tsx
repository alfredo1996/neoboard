"use client";

import { useState, useMemo } from "react";
import { LayoutDashboard } from "lucide-react";
import { useDashboards } from "@/hooks/use-dashboards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  EmptyState,
} from "@neoboard/components";

interface DashboardPickerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (dashboardId: string) => void;
}

export function DashboardPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: DashboardPickerDialogProps) {
  const { data: dashboards, isLoading } = useDashboards();
  const [search, setSearch] = useState("");

  const editable = useMemo(() => {
    if (!dashboards) return [];
    return dashboards.filter(
      (d) => d.role === "owner" || d.role === "editor" || d.role === "admin"
    );
  }, [dashboards]);

  const filtered = useMemo(() => {
    if (!search) return editable;
    const q = search.toLowerCase();
    return editable.filter((d) => d.name.toLowerCase().includes(q));
  }, [editable, search]);

  function handleSelect(dashboardId: string) {
    setSearch("");
    onSelect(dashboardId);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setSearch(""); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Choose a Dashboard</DialogTitle>
        </DialogHeader>

        {editable.length > 3 && (
          <Input
            placeholder="Search dashboards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2"
          />
        )}

        <div className="max-h-[300px] overflow-y-auto space-y-1">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Loading dashboards...
            </p>
          )}

          {!isLoading && editable.length === 0 && (
            <EmptyState
              icon={<LayoutDashboard className="h-10 w-10" />}
              title="No editable dashboards"
              description="Create a dashboard first, then come back to use this template."
            />
          )}

          {!isLoading && editable.length > 0 && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No dashboards match your search.
            </p>
          )}

          {filtered.map((d) => (
            <button
              key={d.id}
              type="button"
              className="w-full text-left rounded-md px-3 py-2.5 hover:bg-accent transition-colors flex items-center justify-between gap-2"
              onClick={() => handleSelect(d.id)}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{d.name}</p>
                {d.description && (
                  <p className="text-xs text-muted-foreground truncate">{d.description}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {d.widgetCount} widget{d.widgetCount !== 1 ? "s" : ""}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
