"use client";

import { useState, useMemo } from "react";
import { FlaskConical, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useWidgetTemplates, useDeleteWidgetTemplate } from "@/hooks/use-widget-templates";
import { getChartConfig } from "@/lib/chart-registry";
import {
  PageHeader,
  EmptyState,
  LoadingOverlay,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ConfirmDialog,
} from "@neoboard/components";
import type { WidgetTemplate } from "@/lib/db/schema";

function TemplateCard({
  template,
  canDelete,
  onDelete,
}: {
  readonly template: WidgetTemplate;
  readonly canDelete: boolean;
  readonly onDelete: () => void;
}) {
  const chartLabel =
    getChartConfig(template.chartType)?.label ?? template.chartType;

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{template.name}</p>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {template.description}
            </p>
          )}
        </div>
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label="Delete template"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{chartLabel}</Badge>
        <Badge variant="outline">{template.connectorType}</Badge>
        {(template.tags ?? []).map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs font-normal">
            {tag}
          </Badge>
        ))}
      </div>

      {template.query && (
        <pre className="text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap line-clamp-3">
          {template.query}
        </pre>
      )}

      {template.createdAt && (
        <p className="text-xs text-muted-foreground">
          Saved {new Date(template.createdAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

export default function WidgetLabPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const role = session?.user?.role ?? "creator";

  const { data: templates, isLoading } = useWidgetTemplates();
  const deleteTemplate = useDeleteWidgetTemplate();

  const [search, setSearch] = useState("");
  const [filterChartType, setFilterChartType] = useState<string>("all");
  const [filterConnector, setFilterConnector] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const chartTypes = useMemo(() => {
    if (!templates) return [];
    return [...new Set(templates.map((t) => t.chartType))].sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const allTags = useMemo(() => {
    if (!templates) return [];
    const tags = templates.flatMap((t) => t.tags ?? []);
    return [...new Set(tags)].sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    return templates.filter((t) => {
      if (
        search &&
        !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !(t.description ?? "").toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      if (filterChartType !== "all" && t.chartType !== filterChartType)
        return false;
      if (filterConnector !== "all" && t.connectorType !== filterConnector)
        return false;
      if (filterTag !== "all" && !(t.tags ?? []).includes(filterTag))
        return false;
      return true;
    });
  }, [templates, search, filterChartType, filterConnector, filterTag]);

  function canDelete(template: WidgetTemplate) {
    return role === "admin" || template.createdBy === userId;
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Widget Lab"
        description="Reusable widget templates you can apply to any dashboard"
      />

      <div className="mt-6 flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />

          <Select value={filterChartType} onValueChange={setFilterChartType}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Chart type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All chart types</SelectItem>
              {chartTypes.map((ct) => (
                <SelectItem key={ct} value={ct}>
                  {getChartConfig(ct)?.label ?? ct}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterConnector} onValueChange={setFilterConnector}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Connector" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All connectors</SelectItem>
              <SelectItem value="neo4j">Neo4j</SelectItem>
              <SelectItem value="postgresql">PostgreSQL</SelectItem>
            </SelectContent>
          </Select>

          {allTags.length > 0 && (
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <LoadingOverlay loading={isLoading} text="Loading templates...">
          {!isLoading && filtered.length === 0 && (
            templates?.length === 0 ? (
              <EmptyState
                icon={<FlaskConical className="h-12 w-12" />}
                title="No templates yet"
                description='Save a widget as a template from any dashboard in edit mode using the "Save to Widget Lab" action.'
              />
            ) : (
              <EmptyState
                icon={<FlaskConical className="h-12 w-12" />}
                title="No templates match your filters"
                description="Try adjusting the search or filter options."
              />
            )
          )}
          {!isLoading && filtered.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  canDelete={canDelete(template)}
                  onDelete={() => setDeleteTarget(template.id)}
                />
              ))}
            </div>
          )}
        </LoadingOverlay>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Template"
        description="This will permanently delete this template. It will not affect existing dashboard widgets."
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            deleteTemplate.mutate(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
