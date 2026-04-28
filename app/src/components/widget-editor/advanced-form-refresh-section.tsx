"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { getChartConfig } from "@/lib/plugin/chart-helpers";
import { Checkbox, Label, Button, Badge } from "@neoboard/components";

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
                const allSelected = otherWidgets.every((w) =>
                  refreshWidgetIds.includes(w.id),
                );
                setRefreshWidgetIds(
                  allSelected ? [] : otherWidgets.map((w) => w.id),
                );
              }}
            >
              {otherWidgets.every((w) => refreshWidgetIds.includes(w.id))
                ? "Deselect all"
                : "Select all"}
            </Button>
          </div>
          {otherWidgets.map((w) => (
            <div key={w.id} className="flex items-center gap-2">
              <Checkbox
                id={`refresh-widget-${w.id}`}
                checked={refreshWidgetIds.includes(w.id)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setRefreshWidgetIds([...refreshWidgetIds, w.id]);
                  } else {
                    setRefreshWidgetIds(
                      refreshWidgetIds.filter((id: string) => id !== w.id),
                    );
                  }
                }}
              />
              <Label
                htmlFor={`refresh-widget-${w.id}`}
                className="text-sm flex items-center gap-1.5"
              >
                {w.title || "(untitled)"}
                <Badge variant="outline" className="text-xs font-normal">
                  {getChartConfig(w.chartType)?.label ?? w.chartType}
                </Badge>
              </Label>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No other widgets on this page.
        </p>
      )}
    </div>
  );
}
