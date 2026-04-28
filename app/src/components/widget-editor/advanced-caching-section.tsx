"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { Checkbox, Input, Label } from "@neoboard/components";

export function AdvancedCachingSection() {
  const enableCache = useWidgetEditorStore((s) => s.enableCache);
  const setEnableCache = useWidgetEditorStore((s) => s.setEnableCache);
  const cacheTtlMinutes = useWidgetEditorStore((s) => s.cacheTtlMinutes);
  const setCacheTtlMinutes = useWidgetEditorStore((s) => s.setCacheTtlMinutes);

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
        Caching
      </h4>
      <div className="flex items-center gap-2">
        <Checkbox
          id="enable-cache"
          checked={enableCache}
          onCheckedChange={(checked) => setEnableCache(!!checked)}
        />
        <Label htmlFor="enable-cache" className="text-sm">
          Cache query results
        </Label>
      </div>
      {enableCache && (
        <div className="pl-6 space-y-1.5">
          <Label htmlFor="cache-ttl" className="text-sm">
            Cache timeout (minutes)
          </Label>
          <Input
            id="cache-ttl"
            type="number"
            min={1}
            max={1440}
            value={cacheTtlMinutes}
            onChange={(e) =>
              setCacheTtlMinutes(Math.max(1, Number(e.target.value)))
            }
            className="w-24"
          />
          <p className="text-xs text-muted-foreground">
            Results are reused for up to {cacheTtlMinutes} minute
            {cacheTtlMinutes !== 1 ? "s" : ""} before re-querying.
          </p>
        </div>
      )}
    </div>
  );
}
