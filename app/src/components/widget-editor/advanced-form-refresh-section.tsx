"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { getChartConfig } from "@/lib/plugin/chart-helpers";
import { Badge, Button, MultiSelect } from "@neoboard/components";
import type { MultiSelectOption } from "@neoboard/components";

export interface AdvancedFormRefreshSectionProps {
  otherWidgets: { id: string; title: string; chartType: string }[];
}

export function AdvancedFormRefreshSection({
  otherWidgets,
}: AdvancedFormRefreshSectionProps) {
  const refreshWidgetIds = useWidgetEditorStore((s) => s.refreshWidgetIds);
  const setRefreshWidgetIds = useWidgetEditorStore(
    (s) => s.setRefreshWidgetIds,
  );

  const options: MultiSelectOption[] = otherWidgets.map((w) => ({
    value: w.id,
    label: w.title || "(untitled)",
  }));

  const allSelected =
    otherWidgets.length > 0 &&
    otherWidgets.every((w) => refreshWidgetIds.includes(w.id));

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
        After Submit
      </h4>
      <p className="text-xs text-muted-foreground">
        Refresh these widgets when the form submits successfully.
      </p>
      {otherWidgets.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {refreshWidgetIds.length} of {otherWidgets.length} selected
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => {
                setRefreshWidgetIds(
                  allSelected ? [] : otherWidgets.map((w) => w.id),
                );
              }}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
          </div>
          <MultiSelect
            options={options}
            value={refreshWidgetIds}
            onChange={setRefreshWidgetIds}
            placeholder="Select widgets to refresh…"
            searchPlaceholder="Search widgets…"
            emptyText="No widgets match."
            className="w-full"
            renderOption={(opt) => {
              const widget = otherWidgets.find((w) => w.id === opt.value);
              const chartTypeLabel = widget
                ? (getChartConfig(widget.chartType)?.label ?? widget.chartType)
                : "";
              return (
                <span className="flex flex-1 items-center gap-1.5">
                  <span className="truncate">{opt.label}</span>
                  {chartTypeLabel && (
                    <Badge
                      variant="outline"
                      className="text-xs font-normal shrink-0"
                    >
                      {chartTypeLabel}
                    </Badge>
                  )}
                </span>
              );
            }}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No other widgets on this page.
        </p>
      )}
    </div>
  );
}
