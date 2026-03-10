"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Trash2, Pencil, Plus, LayoutDashboard } from "lucide-react";
import { useSession } from "next-auth/react";
import { useWidgetTemplates, useDeleteWidgetTemplate } from "@/hooks/use-widget-templates";
import { useConnections } from "@/hooks/use-connections";
import { getChartConfig } from "@/lib/chart-registry";
import { DashboardPickerDialog } from "@/components/dashboard-picker-dialog";
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
  CodePreview,
} from "@neoboard/components";
import type { WidgetTemplate } from "@/lib/db/schema";
import { WidgetEditorModal } from "@/components/widget-editor-modal";

function TemplateCard({
  template,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onUseInDashboard,
}: {
  readonly template: WidgetTemplate;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onUseInDashboard: () => void;
}) {
  const chartLabel =
    getChartConfig(template.chartType)?.label ?? template.chartType;

  return (
    <div className="rounded-lg border bg-card flex flex-col overflow-hidden" data-testid="template-card">
      <div className="p-3 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{template.name}</p>
            {template.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {template.description}
              </p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onUseInDashboard}
              aria-label="Use in Dashboard"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
            </Button>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={onEdit}
                aria-label="Edit template"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                aria-label="Delete template"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <CodePreview
          value={template.query}
          language={template.connectorType === "postgresql" ? "SQL" : "Cypher"}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs">{chartLabel}</Badge>
            <Badge variant="outline" className="text-xs">{template.connectorType}</Badge>
            {(template.tags ?? []).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] font-normal">
                {tag}
              </Badge>
            ))}
          </div>
          {template.createdAt && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {new Date(template.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WidgetLabPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const role = session?.user?.role ?? "creator";

  const { data: templates, isLoading } = useWidgetTemplates();
  const deleteTemplate = useDeleteWidgetTemplate();
  const { data: connections = [] } = useConnections();

  const [search, setSearch] = useState("");
  const [filterChartType, setFilterChartType] = useState<string>("all");
  const [filterConnector, setFilterConnector] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [useTarget, setUseTarget] = useState<string | null>(null);

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WidgetTemplate | undefined>();
  const editorMode = editingTemplate ? "lab-edit" as const : "lab-create" as const;

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

  function canEditOrDelete(template: WidgetTemplate) {
    return role === "admin" || template.createdBy === userId;
  }

  function handleCreate() {
    setEditingTemplate(undefined);
    setEditorOpen(true);
  }

  function handleEdit(template: WidgetTemplate) {
    setEditingTemplate(template);
    setEditorOpen(true);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Widget Lab"
        description="Reusable widget templates you can apply to any dashboard"
        actions={
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New Template
          </Button>
        }
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
                description='Create a new template or save a widget from any dashboard using the "Save to Widget Lab" action.'
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
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  canEdit={canEditOrDelete(template)}
                  canDelete={canEditOrDelete(template)}
                  onEdit={() => handleEdit(template)}
                  onDelete={() => setDeleteTarget(template.id)}
                  onUseInDashboard={() => setUseTarget(template.id)}
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

      <WidgetEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        template={editingTemplate}
        connections={connections}
        onSave={() => {/* not used in lab mode */}}
        onLabSaved={() => setEditorOpen(false)}
      />

      <DashboardPickerDialog
        open={useTarget !== null}
        onOpenChange={(open) => { if (!open) setUseTarget(null); }}
        onSelect={(dashboardId) => {
          router.push(`/${dashboardId}/edit?templateId=${useTarget}`);
        }}
      />
    </div>
  );
}
