import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  GUIDED_FILTER_OPS,
  withSource,
  type GuidedFilterOp,
  type GuidedPicks,
  type GuidedSource,
} from "@/lib/guided-query";

export interface GuidedQueryBuilderProps {
  /** Labels or tables with their fields — see `guidedSources`. */
  sources: GuidedSource[];
  picks: GuidedPicks;
  onChange: (picks: GuidedPicks) => void;
  loading?: boolean;
  /** Message shown in place of the form when the schema fetch failed. */
  error?: string;
  className?: string;
}

// ponytail: native <select> styled like Input — one element, keyboard and
// screen-reader complete, and drivable in jsdom (Radix Select is not).
const selectClass =
  "flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Pick a source → pick fields → optional filter → limit. Every change is
 * reported through `onChange`; the caller keeps the picks and turns them into
 * query text with the connector's own builder (#1696).
 */
function GuidedQueryBuilder({
  sources,
  picks,
  onChange,
  loading = false,
  error,
  className,
}: Readonly<GuidedQueryBuilderProps>) {
  const id = React.useId();
  const fields = sources.find((s) => s.name === picks.source)?.fields ?? [];
  const filtering = picks.filter.field !== "";

  const setFilter = (patch: Partial<GuidedPicks["filter"]>) =>
    onChange({ ...picks, filter: { ...picks.filter, ...patch } });

  const toggleField = (field: string, on: boolean) =>
    onChange({
      ...picks,
      fields: on
        ? [...picks.fields, field]
        : picks.fields.filter((f) => f !== field),
    });

  let body: React.ReactNode;
  if (loading) {
    body = <p className="text-xs text-muted-foreground">Loading schema…</p>;
  } else if (error) {
    body = (
      <p role="alert" className="text-xs text-destructive">
        {error}
      </p>
    );
  } else if (sources.length === 0) {
    body = (
      <p className="text-xs text-muted-foreground">
        No labels or tables found.
      </p>
    );
  } else {
    body = (
      <>
        <div className="space-y-2">
          <Label htmlFor={`${id}-source`}>Source</Label>
          <select
            id={`${id}-source`}
            className={selectClass}
            value={picks.source}
            onChange={(e) => onChange(withSource(picks, e.target.value))}
          >
            <option value="">Choose a label or table…</option>
            {sources.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {picks.source && (
          <>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium leading-none">
                Fields
              </legend>
              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No fields — the whole record is returned.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {fields.map((field) => {
                    const fieldId = `${id}-field-${field}`;
                    return (
                      <div key={field} className="flex items-center gap-2">
                        <Checkbox
                          id={fieldId}
                          checked={picks.fields.includes(field)}
                          onCheckedChange={(v) => toggleField(field, v === true)}
                        />
                        <Label htmlFor={fieldId} className="font-normal">
                          {field}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div className="space-y-2">
                <Label htmlFor={`${id}-filter-field`}>Filter</Label>
                <select
                  id={`${id}-filter-field`}
                  aria-label="Filter field"
                  className={selectClass}
                  value={picks.filter.field}
                  onChange={(e) => setFilter({ field: e.target.value })}
                >
                  <option value="">No filter</option>
                  {fields.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
              <select
                aria-label="Filter operator"
                className={cn(selectClass, "w-auto")}
                value={picks.filter.op}
                disabled={!filtering}
                onChange={(e) =>
                  setFilter({ op: e.target.value as GuidedFilterOp })
                }
              >
                {GUIDED_FILTER_OPS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <Input
                size="sm"
                aria-label="Filter value"
                placeholder="Value"
                value={picks.filter.value}
                disabled={!filtering}
                onChange={(e) => setFilter({ value: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${id}-limit`}>Limit</Label>
              <Input
                id={`${id}-limit`}
                size="sm"
                type="number"
                min={1}
                step={1}
                className="w-28"
                value={picks.limit}
                onChange={(e) =>
                  onChange({ ...picks, limit: e.target.valueAsNumber })
                }
              />
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div
      className={cn("space-y-4 rounded-xl border bg-muted/30 p-4", className)}
      data-testid="guided-query-builder"
    >
      {body}
    </div>
  );
}

export { GuidedQueryBuilder };
