"use client";

import { returnFocus } from "@/lib/return-focus";
import { useState, useMemo, useRef, type MouseEventHandler } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Pencil,
  Plus,
  LayoutDashboard,
  Copy,
  MoreHorizontal,
  Play,
} from "lucide-react";
import { useSession } from "next-auth/react";
import {
  useWidgetTemplates,
  useDeleteWidgetTemplate,
  useCreateWidgetTemplate,
} from "@/hooks/use-widget-templates";
import { useConnections } from "@/hooks/use-connections";
import { getChartConfig } from "@/lib/plugin/chart-helpers";
import { isContentOnlyChartType } from "@/lib/widget/content-only-chart";
import { DashboardPickerDialog } from "@/components/dashboard-picker-dialog";
import {
  EmptyState,
  LoadingOverlay,
  Tag,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  focusedMenuTrigger,
  useToast,
} from "@neoboard/components";
import {
  FilterLine,
  List,
  ListRow,
  PageHeader,
} from "@neoboard/components/kit";
import type { WidgetTemplate } from "@/lib/db/schema";
import { useConnectors } from "@/hooks/use-connectors";
import { connectorLabel } from "@/lib/connector/connector-label";
import { WidgetEditorModal } from "@/components/widget-editor-modal";
import {
  templateConnectionLabel,
  templateFilters,
  matchesTemplateSearch,
  templateListMeta,
} from "./template-list";

export default function WidgetLibraryPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const role = session?.user?.role ?? "creator";

  const { toast } = useToast();
  const { data: templates, isLoading } = useWidgetTemplates();
  const deleteTemplate = useDeleteWidgetTemplate();
  const createTemplate = useCreateWidgetTemplate();
  const { data: loadedConnections, isError: connectionsFailed } =
    useConnections();
  const connections = loadedConnections ?? [];
  // Loading stays undefined; a failed request is "none", so the label stops
  // at "not available".
  const labelConnections = connectionsFailed ? [] : loadedConnections;
  const { data: connectors = [] } = useConnectors();
  const [testingTemplateId, setTestingTemplateId] = useState<string | null>(
    null,
  );

  const [search, setSearch] = useState("");
  const [filterChartType, setFilterChartType] = useState<string>("all");
  const [filterConnector, setFilterConnector] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  // No dialog here has a Trigger: where focus goes when one closes (#2125,
  // #2146).
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [useTarget, setUseTarget] = useState<string | null>(null);

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<
    WidgetTemplate | undefined
  >();
  const editorMode = editingTemplate
    ? ("lab-edit" as const)
    : ("lab-create" as const);

  const chartTypes = useMemo(() => {
    if (!templates) return [];
    return [...new Set(templates.map((t) => t.chartType))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [templates]);

  const allTags = useMemo(() => {
    if (!templates) return [];
    const tags = templates.flatMap((t) => t.tags ?? []);
    return [...new Set(tags)].sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    return templates.filter((t) => {
      if (!matchesTemplateSearch(t, search)) return false;
      if (filterChartType !== "all" && t.chartType !== filterChartType)
        return false;
      if (filterConnector !== "all" && t.connectorType !== filterConnector)
        return false;
      if (filterTag !== "all" && !(t.tags ?? []).includes(filterTag))
        return false;
      return true;
    });
  }, [templates, search, filterChartType, filterConnector, filterTag]);

  const filters = templateFilters(
    {
      search,
      chartType: filterChartType,
      connector: filterConnector,
      tag: filterTag,
    },
    {
      chartType: getChartConfig(filterChartType)?.label ?? filterChartType,
      connector: connectorLabel(connectors, filterConnector),
    },
  );

  function canEditOrDelete(template: WidgetTemplate) {
    return role === "admin" || template.createdBy === userId;
  }

  const handleCreate: MouseEventHandler<HTMLButtonElement> = (e) => {
    setReturnFocusTo(e.currentTarget);
    setEditingTemplate(undefined);
    setEditorOpen(true);
  };

  function handleEdit(template: WidgetTemplate, from: HTMLElement | null) {
    setReturnFocusTo(from);
    setEditingTemplate(template);
    setEditorOpen(true);
  }

  const focusOpener = () => returnFocus(returnFocusTo, headingRef.current);

  function handleDuplicate(template: WidgetTemplate) {
    const baseName = template.name.replace(/\s*\(copy(?:\s\d+)?\)$/, "");
    createTemplate.mutate(
      {
        name: `${baseName} (copy)`,
        description: template.description ?? undefined,
        tags: template.tags ?? undefined,
        chartType: template.chartType,
        // The column is nullable now (#1900); the API takes absent, not null.
        connectorType: template.connectorType ?? undefined,
        connectionId: template.connectionId ?? undefined,
        query: template.query,
        settings: (template.settings as Record<string, unknown>) ?? undefined,
      },
      {
        onSuccess: () =>
          toast({
            title: "Template duplicated",
            description: `"${baseName} (copy)" has been created.`,
          }),
        onError: (err) =>
          toast({
            title: "Failed to duplicate template",
            description:
              err instanceof Error ? err.message : "Something went wrong.",
            variant: "destructive",
          }),
      },
    );
  }

  async function handleTestQuery(template: WidgetTemplate) {
    if (!template.connectionId || !template.query) return;
    setTestingTemplateId(template.id);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: template.connectionId,
          query: template.query,
          params: template.params ?? {},
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        toast({
          title: "Query executed successfully",
          description: `Template "${template.name}" query returned a valid response.`,
        });
      } else {
        const err = await res.json();
        toast({
          title: "Query failed",
          description: err.error?.message ?? res.statusText,
          variant: "destructive",
        });
      }
    } catch (e) {
      const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
      toast({
        title: isTimeout ? "Query timed out" : "Query failed",
        description: isTimeout
          ? "The query did not respond within 30 seconds."
          : e instanceof Error
            ? e.message
            : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setTestingTemplateId(null);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Widget Library"
        titleRef={headingRef}
        meta={
          templates?.length
            ? templateListMeta(templates.length)
            : "Reusable widget templates you can apply to any dashboard"
        }
        actions={
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New template
          </Button>
        }
      />

      {/* The ground behind the panels, as on the dashboards page (#2219). */}
      <div className="flex flex-1 flex-col gap-4 bg-page-ground p-4 md:p-7">
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
              {connectors.map((c) => (
                <SelectItem key={c.type} value={c.type}>
                  {c.label}
                </SelectItem>
              ))}
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
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <FilterLine
          prefix="Showing templates where"
          filters={filters}
          onRemove={(id) => {
            if (id === "search") setSearch("");
            else if (id === "chartType") setFilterChartType("all");
            else if (id === "connector") setFilterConnector("all");
            else setFilterTag("all");
          }}
          onReset={() => {
            setSearch("");
            setFilterChartType("all");
            setFilterConnector("all");
            setFilterTag("all");
          }}
        />

        <LoadingOverlay loading={isLoading} text="Loading templates…">
          {!isLoading &&
            filtered.length === 0 &&
            (templates?.length === 0 ? (
              <EmptyState
                title="No widget templates yet"
                description="Save a widget as a template from its menu on any dashboard, and it appears here for every dashboard to reuse."
                action={
                  <Button variant="secondary" onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create a template
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No templates match your filters"
                description="Try adjusting the search or filter options."
              />
            ))}
          {!isLoading && filtered.length > 0 && (
            <List
              label="Templates"
              columns={["Name", "Chart", "Connection", "Tags"]}
            >
              {filtered.map((template) => {
                const canChange = canEditOrDelete(template);
                const contentOnly = isContentOnlyChartType(template.chartType);
                return (
                  <ListRow
                    key={template.id}
                    title={template.name}
                    description={template.description ?? undefined}
                    meta={[
                      getChartConfig(template.chartType)?.label ??
                        template.chartType,
                      // A content widget (markdown, iframe) has no connection.
                      contentOnly
                        ? "—"
                        : templateConnectionLabel(
                            template,
                            labelConnections,
                            connectors,
                          ),
                      <span key="t" className="flex gap-1.5">
                        {(template.tags ?? []).map((tag) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </span>,
                    ]}
                    menu={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={`Template actions for ${template.name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setReturnFocusTo(focusedMenuTrigger());
                              setUseTarget(template.id);
                            }}
                          >
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            Use in Dashboard
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDuplicate(template)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          {template.query && template.connectionId && (
                            <DropdownMenuItem
                              disabled={testingTemplateId === template.id}
                              onClick={() => handleTestQuery(template)}
                            >
                              <Play className="mr-2 h-4 w-4" />
                              Test query
                            </DropdownMenuItem>
                          )}
                          {canChange && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleEdit(template, focusedMenuTrigger())
                              }
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canChange && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setReturnFocusTo(focusedMenuTrigger());
                                  setDeleteTarget(template.id);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete…
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                );
              })}
            </List>
          )}
        </LoadingOverlay>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        action="Delete"
        object="template"
        name={templates?.find((t) => t.id === deleteTarget)?.name}
        consequences="Widgets already made from it keep working."
        returnFocusTo={returnFocusTo}
        onConfirm={() => {
          if (deleteTarget) {
            // The card leaves once the list refetches: land on the heading.
            setReturnFocusTo(headingRef.current);
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
        onSave={() => {
          /* not used in lab mode */
        }}
        onLabSaved={() => {
          // The empty state and its button leave with the refetch, after the
          // close.
          if (!templates?.length) setReturnFocusTo(headingRef.current);
          setEditorOpen(false);
        }}
        onCloseAutoFocus={focusOpener}
      />

      <DashboardPickerDialog
        open={useTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUseTarget(null);
        }}
        onSelect={(dashboardId) => {
          router.push(`/${dashboardId}/edit?templateId=${useTarget}`);
        }}
        onCloseAutoFocus={focusOpener}
      />
    </div>
  );
}
