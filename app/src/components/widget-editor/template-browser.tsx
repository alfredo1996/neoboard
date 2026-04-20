"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import type { WidgetTemplate } from "@/lib/db/schema";
import type { ConnectorType } from "@/lib/connector/connector-types";
import { getChartConfig } from "@/lib/plugin/chart-helpers";
import { CONNECTOR_LANGUAGES } from "@/lib/connector/connector-types";
import {
  Badge,
  Button,
  Input,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  CodePreview,
} from "@neoboard/components";

interface TemplateBrowserProps {
  templates: WidgetTemplate[] | undefined;
  loading: boolean;
  connectorType: ConnectorType | null;
  onApply: (template: WidgetTemplate) => void;
  onBack: () => void;
}

export function TemplateBrowser({
  templates,
  loading,
  connectorType,
  onApply,
  onBack,
}: TemplateBrowserProps) {
  const [search, setSearch] = useState("");

  return (
    <>
      <DialogHeader>
        <DialogTitle>Browse Templates</DialogTitle>
      </DialogHeader>
      <div className="py-4 flex-1 overflow-y-auto min-h-[400px]">
        {!loading && templates && templates.length > 0 && (
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3 max-w-xs"
          />
        )}
        {loading && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <p className="text-sm">Loading templates...</p>
          </div>
        )}
        {!loading && (!templates || templates.length === 0) && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <FlaskConical className="h-8 w-8 opacity-40" />
            <p className="text-sm">
              No templates available
              {connectorType ? ` for ${connectorType}` : ""}.
            </p>
          </div>
        )}
        {!loading &&
          templates &&
          templates.length > 0 &&
          (() => {
            const filtered = search
              ? templates.filter((t) =>
                  t.name.toLowerCase().includes(search.toLowerCase()),
                )
              : templates;
            return filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                <p className="text-sm">
                  No templates match &ldquo;{search}&rdquo;
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onApply(t)}
                    className="text-left rounded-lg border p-2 hover:bg-accent transition-colors flex flex-col gap-1.5"
                  >
                    <CodePreview
                      value={t.query}
                      language={
                        CONNECTOR_LANGUAGES[t.connectorType as ConnectorType] ??
                        "Cypher"
                      }
                      maxLines={2}
                    />
                    <span className="font-medium text-xs truncate w-full">
                      {t.name}
                    </span>
                    <div className="flex gap-1 flex-wrap">
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {getChartConfig(t.chartType)?.label ?? t.chartType}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {t.connectorType}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            );
          })()}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
      </DialogFooter>
    </>
  );
}
