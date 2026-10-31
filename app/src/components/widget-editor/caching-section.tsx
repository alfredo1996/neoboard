"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { Input, SegmentedControl, SettingRow } from "@neoboard/components";
import { Info } from "lucide-react";

export type CacheChoice = "off" | "timed" | "forever";

/**
 * The one choice behind three stored fields (#2388). `cacheMode: "forever"`
 * wins whatever `enableCache` says, because that is how the query layer
 * resolves it (resolve-cache-options.ts), so a saved Off plus Forever opens as
 * Forever and an untouched save changes nothing.
 */
export function cacheChoiceOf(
  enableCache: boolean,
  cacheMode: unknown,
): CacheChoice {
  if (cacheMode === "forever") return "forever";
  return enableCache ? "timed" : "off";
}

/** What picking a choice writes. Forever leaves `enableCache` as it was. */
export function cacheWritesFor(choice: CacheChoice): {
  enableCache?: boolean;
  cacheMode: "ttl" | "forever";
} {
  if (choice === "forever") return { cacheMode: "forever" };
  return { enableCache: choice === "timed", cacheMode: "ttl" };
}

export function CachingSection() {
  const enableCache = useWidgetEditorStore((s) => s.enableCache);
  const setEnableCache = useWidgetEditorStore((s) => s.setEnableCache);
  const cacheTtlMinutes = useWidgetEditorStore((s) => s.cacheTtlMinutes);
  const setCacheTtlMinutes = useWidgetEditorStore((s) => s.setCacheTtlMinutes);
  const cacheMode = useWidgetEditorStore((s) => s.chartOptions.cacheMode);
  const setChartOptions = useWidgetEditorStore((s) => s.setChartOptions);
  const choice = cacheChoiceOf(enableCache, cacheMode);

  function choose(next: string) {
    const writes = cacheWritesFor(next as CacheChoice);
    if (writes.enableCache !== undefined) setEnableCache(writes.enableCache);
    setChartOptions((opts) => ({ ...opts, cacheMode: writes.cacheMode }));
  }

  return (
    <>
      <SettingRow label="Cache" labelId="cache-choice-label" wraps>
        <SegmentedControl
          aria-labelledby="cache-choice-label"
          value={choice}
          onValueChange={choose}
          options={[
            { value: "off", label: "Off" },
            { value: "timed", label: "Timed" },
            { value: "forever", label: "Forever" },
          ]}
        />
      </SettingRow>
      {choice === "timed" && (
        <SettingRow label="Minutes" htmlFor="cache-ttl">
          <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
            <Input
              id="cache-ttl"
              type="number"
              min={1}
              max={1440}
              value={cacheTtlMinutes}
              onChange={(e) => {
                // Math.max(1, Number("")) is 1, so clearing the field silently
                // committed 1 and made it unclearable (#1292).
                if (e.target.value === "") return;
                setCacheTtlMinutes(Math.max(1, Number(e.target.value)));
              }}
              className="w-[84px]"
            />
            min
          </span>
        </SettingRow>
      )}
      {choice === "forever" && (
        <p
          className="flex items-start gap-2 text-meta text-muted-foreground"
          data-testid="cache-forever-info"
        >
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          Data will be fetched once and cached until manually refreshed.
        </p>
      )}
    </>
  );
}
