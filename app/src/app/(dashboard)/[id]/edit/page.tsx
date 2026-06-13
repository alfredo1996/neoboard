"use client";

import { use, useEffect, useCallback, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Filter,
  Plus,
  Save,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDashboard,
  useUpdateDashboard,
  useUpdateDashboardThumbnails,
} from "@/hooks/use-dashboards";
import { useConnections } from "@/hooks/use-connections";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { useParameterStore } from "@/stores/parameter-store";
import { filterParentParams } from "@/lib/parameter/format-parameter-value";
import { buildParameterSourceMap } from "@/lib/parameter/collect-parameter-names";
import { scrollToWidgetWhenReady } from "@/lib/widget/scroll-to-widget";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useWidgetTemplates } from "@/hooks/use-widget-templates";
import { DashboardContainer } from "@/components/dashboard-container";
import { PageTabs } from "@/components/page-tabs";
import { WidgetEditorModal } from "@/components/widget-editor-modal";
import { DashboardAssignPanel } from "@/components/dashboard-assign-panel";
import { SaveTemplateDialog } from "@/components/save-template-dialog";
import type { ConnectorType } from "@/lib/connector/connector-types";
import { migrateLayout } from "@/lib/dashboard/migrate-layout";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type {
  DashboardWidget,
  GridLayoutItem,
  WidgetTemplate,
} from "@/lib/db/schema";
import { captureDashboardThumbnails } from "@/lib/dashboard/capture-dashboard-thumbnails";
import {
  Button,
  Skeleton,
  Alert,
  AlertDescription,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@neoboard/components";
import {
  ConfirmDialog,
  EmptyState,
  LoadingButton,
  Toolbar,
  ToolbarSection,
  ToolbarSeparator,
  useToast,
} from "@neoboard/components";

export default function DashboardEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; templateId?: string }>;
}) {
  const { id } = use(params);
  const { page: pageParam, templateId: templateIdParam } = use(searchParams);
  const router = useRouter();
  const saveToDashboard = useParameterStore((s) => s.saveToDashboard);
  const restoreFromDashboard = useParameterStore((s) => s.restoreFromDashboard);
  const prevDashboardId = useRef<string | null>(null);

  useEffect(() => {
    if (prevDashboardId.current && prevDashboardId.current !== id) {
      saveToDashboard(prevDashboardId.current);
    }
    prevDashboardId.current = id;
    restoreFromDashboard(id);
    return () => {
      saveToDashboard(id);
    };
  }, [id, saveToDashboard, restoreFromDashboard]);

  const parameters = useParameterStore((s) => s.parameters);
  const parameterCount = useMemo(
    () => filterParentParams(Object.entries(parameters)).length,
    [parameters],
  );
  const hasParameters = parameterCount > 0;
  // null = auto mode (show when params exist), boolean = user override
  const [barOverride, setBarOverride] = useState<boolean | null>(null);
  const effectiveShowBar = barOverride !== null ? barOverride : hasParameters;

  const initialPage = pageParam !== undefined ? parseInt(pageParam, 10) : 0;
  const [visitedPages, setVisitedPages] = useState<Set<number>>(
    () => new Set([isNaN(initialPage) ? 0 : initialPage]),
  );

  function markVisited(index: number) {
    setVisitedPages((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }

  function handleSelectPage(index: number) {
    markVisited(index);
    setActivePage(index);
  }

  // After reorderPages the store adjusts activePageIndex. Mark the new
  // index as visited so the page stays in the DOM when switching away.
  function handleReorderPages(fromIndex: number, toIndex: number) {
    reorderPages(fromIndex, toIndex);
    const newActive = useDashboardStore.getState().activePageIndex;
    markVisited(newActive);
  }

  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const systemRole = session?.user?.role ?? "creator";
  const isAdmin = systemRole === "admin";

  const { data: dashboard, isLoading } = useDashboard(id);
  const { data: connections } = useConnections();
  const updateDashboard = useUpdateDashboard();
  const updateThumbnails = useUpdateDashboardThumbnails();
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const layout = useDashboardStore((s) => s.layout);
  const activePageIndex = useDashboardStore((s) => s.activePageIndex);
  const setLayout = useDashboardStore((s) => s.setLayout);
  const setActivePage = useDashboardStore((s) => s.setActivePage);
  const addPage = useDashboardStore((s) => s.addPage);
  const removePage = useDashboardStore((s) => s.removePage);
  const renamePage = useDashboardStore((s) => s.renamePage);
  const reorderPages = useDashboardStore((s) => s.reorderPages);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const updateWidget = useDashboardStore((s) => s.updateWidget);
  const updateGridLayout = useDashboardStore((s) => s.updateGridLayout);
  const duplicateWidget = useDashboardStore((s) => s.duplicateWidget);
  const markSaved = useDashboardStore((s) => s.markSaved);
  const { toast } = useToast();

  const {
    showNavWarning,
    setShowNavWarning,
    confirmNavigation,
    cancelNavigation,
    requestNavigation,
  } = useUnsavedChangesWarning();

  const parameterSourceMap = useMemo(
    () => buildParameterSourceMap(layout),
    [layout],
  );

  const handleNavigateToPage = useCallback(
    (pageId: string, scrollToWidgetId?: string) => {
      const index = layout.pages.findIndex((p) => p.id === pageId);
      if (index >= 0) {
        markVisited(index);
        setActivePage(index);
        if (scrollToWidgetId) {
          scrollToWidgetWhenReady(scrollToWidgetId);
        }
      }
    },
    [layout.pages, setActivePage],
  );

  // Template sync — fetch all tenant templates once; build lookup map
  const { data: allTemplates } = useWidgetTemplates();
  const templateMap = useMemo<Record<string, WidgetTemplate>>(
    () => Object.fromEntries((allTemplates ?? []).map((t) => [t.id, t])),
    [allTemplates],
  );

  const handleSyncWidget = useCallback(
    (widget: DashboardWidget) => {
      const tmpl = widget.templateId
        ? templateMap[widget.templateId]
        : undefined;
      if (!tmpl) return; // template deleted — "Detach" will clean up
      updateWidget(widget.id, {
        ...widget,
        chartType: tmpl.chartType,
        query: tmpl.query ?? "",
        settings: {
          ...widget.settings,
          ...(tmpl.settings ?? undefined),
          // Never overwrite the widget's connection
          connectionId: widget.settings?.connectionId,
        },
        templateSyncedAt:
          tmpl.updatedAt?.toISOString() ?? new Date().toISOString(),
      });
    },
    [templateMap, updateWidget],
  );

  const handleDetachWidget = useCallback(
    (widgetId: string) => {
      const page = layout.pages.find((p) =>
        p.widgets.some((w) => w.id === widgetId),
      );
      const widget = page?.widgets.find((w) => w.id === widgetId);
      if (!widget) return;
      updateWidget(widgetId, {
        ...widget,
        templateId: undefined,
        templateSyncedAt: undefined,
      });
    },
    [layout.pages, updateWidget],
  );

  const [editorOpen, setEditorOpen] = useState(!!templateIdParam);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("add");
  const [editingWidget, setEditingWidget] = useState<
    DashboardWidget | undefined
  >();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [templateWidget, setTemplateWidget] = useState<
    DashboardWidget | undefined
  >();
  const [pendingTemplateId, setPendingTemplateId] = useState<
    string | undefined
  >(templateIdParam);

  // Redirect Readers away from edit mode
  useEffect(() => {
    if (systemRole === "reader") {
      router.replace(`/${id}`);
    }
  }, [systemRole, id, router]);

  // Load dashboard layout into store (migrates v1 → v2 if needed)
  useEffect(() => {
    if (dashboard?.layoutJson) {
      const migrated = migrateLayout(dashboard.layoutJson);
      const targetPage = pageParam !== undefined ? parseInt(pageParam, 10) : 0;
      setLayout(migrated, isNaN(targetPage) ? 0 : targetPage);
    }
  }, [dashboard, setLayout, pageParam]);

  const activePage = layout.pages[activePageIndex] ?? layout.pages[0];

  const handleSave = useCallback(async () => {
    setSaveError(null);
    try {
      // Sanitize: replace any y: Infinity from pending widget additions.
      // react-grid-layout compacts these asynchronously, but if save fires
      // before compaction completes the Infinity value gets persisted and
      // all widgets collapse into a single vertical column on reload.
      const sanitizedLayout = {
        ...layout,
        pages: layout.pages.map((page) => {
          const hasInfinity = page.gridLayout.some(
            (g) => !Number.isFinite(g.y),
          );
          if (!hasInfinity) return page;
          const maxY = page.gridLayout.reduce(
            (m, g) => (Number.isFinite(g.y) ? Math.max(m, g.y + g.h) : m),
            0,
          );
          let nextY = maxY;
          return {
            ...page,
            gridLayout: page.gridLayout.map((g) => {
              if (Number.isFinite(g.y)) return g;
              const placed = { ...g, y: nextY };
              nextY += g.h;
              return placed;
            }),
          };
        }),
      };
      await updateDashboard.mutateAsync({
        id,
        layoutJson: sanitizedLayout,
        expectedVersion: dashboard?.version,
      });
      markSaved();
      // Explicit Save (button / Cmd+S) gets explicit confirmation (#1046);
      // the failure path already has its own sticky error toast (#836).
      toast({ title: "Dashboard saved" });

      // Fire-and-forget: capture widget thumbnails from the active page's live DOM.
      // Uses a short delay to let ECharts finish rendering after any layout changes.
      const container = gridContainerRef.current;
      const currentPage = activePage;
      if (container && currentPage?.widgets.length) {
        setTimeout(async () => {
          try {
            const thumbnails = await captureDashboardThumbnails(
              container,
              currentPage.widgets.map((w) => ({
                id: w.id,
                chartType: w.chartType,
              })),
            );
            if (Object.keys(thumbnails).length > 0) {
              updateThumbnails.mutate({ id, thumbnailJson: thumbnails });
            }
          } catch {
            // Thumbnail capture failure is non-critical — silently ignore
          }
        }, 500);
      }
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save dashboard",
      );
    }
  }, [
    id,
    layout,
    activePage,
    updateDashboard,
    updateThumbnails,
    markSaved,
    dashboard,
    toast,
  ]);

  function openAddWidget() {
    setEditorMode("add");
    setEditingWidget(undefined);
    setEditorOpen(true);
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────
  useKeyboardShortcuts([
    {
      shortcut: "Cmd+S",
      handler: () => {
        handleSave();
      },
    },
    {
      shortcut: "Cmd+E",
      handler: () => {
        // Route through unsaved-changes guard (same as the Back button)
        if (requestNavigation("/" + id)) router.push("/" + id);
      },
    },
    {
      shortcut: "Cmd+Shift+N",
      handler: openAddWidget,
      disabled: editorOpen,
    },
    {
      shortcut: "Escape",
      handler: () => setEditorOpen(false),
      disabled: !editorOpen,
    },
  ]);

  const [cachedPreviewData, setCachedPreviewData] = useState<
    { data: unknown; resultId: string } | undefined
  >();

  function openEditWidget(widget: DashboardWidget) {
    // Grab cached query data so the editor preview shows instantly.
    // Use getQueriesData with partial key — params vary with parameter store values.
    const cachedEntries = queryClient.getQueriesData<{
      data: unknown;
      resultId: string;
    }>({ queryKey: ["widget-query", widget.connectionId, widget.query] });
    const cached = cachedEntries.length > 0 ? cachedEntries[0][1] : undefined;
    setCachedPreviewData(cached ?? undefined);
    setEditorMode("edit");
    setEditingWidget(widget);
    setEditorOpen(true);
  }

  function handleEditorSave(widget: DashboardWidget) {
    if (editorMode === "add") {
      const gridItem: GridLayoutItem = {
        i: widget.id,
        x: (activePage.gridLayout.length * 4) % 12,
        y: Infinity,
        w: 4,
        h: 3,
      };
      addWidget(widget, gridItem);
    } else {
      updateWidget(widget.id, widget);
    }
    queryClient.invalidateQueries({
      queryKey: ["widget-query", widget.connectionId, widget.query],
    });
  }

  return (
    <div className="flex flex-col h-full">
      <Toolbar>
        <ToolbarSection>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (requestNavigation(`/${id}`)) router.push(`/${id}`);
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </ToolbarSection>
        <ToolbarSection className="flex-1">
          <h1 className="text-lg font-bold">
            {isLoading ? "Loading…" : `Editing: ${dashboard?.name ?? ""}`}
          </h1>
        </ToolbarSection>
        <ToolbarSection>
          {isAdmin && !isLoading && dashboard && (
            <>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Users className="mr-2 h-4 w-4" />
                    Sharing
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Sharing</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <DashboardAssignPanel
                      dashboardId={id}
                      isPublic={dashboard.isPublic ?? false}
                      onTogglePublic={(value) => {
                        updateDashboard.mutate({ id, isPublic: value });
                      }}
                    />
                  </div>
                </SheetContent>
              </Sheet>
              <ToolbarSeparator />
            </>
          )}
          {!isLoading && dashboard && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!hasParameters}
                onClick={() =>
                  setBarOverride((prev) => !(prev ?? effectiveShowBar))
                }
                aria-label={
                  effectiveShowBar ? "Hide parameters" : "Show parameters"
                }
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {hasParameters && parameterCount > 0 && (
                  <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {parameterCount}
                  </span>
                )}
              </Button>
              <ToolbarSeparator />
              <Button
                variant="outline"
                size="sm"
                onClick={openAddWidget}
                title="Add widget (Cmd+Shift+N)"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Widget
              </Button>
              <ToolbarSeparator />
              <LoadingButton
                size="sm"
                loading={updateDashboard.isPending}
                loadingText="Saving..."
                onClick={handleSave}
                title="Save dashboard (Cmd+S)"
              >
                <Save className="mr-2 h-4 w-4" />
                Save
              </LoadingButton>
            </>
          )}
        </ToolbarSection>
      </Toolbar>

      {isLoading && (
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[400px]" />
        </div>
      )}

      {!isLoading && !dashboard && (
        <div className="p-6">
          <EmptyState
            icon={<LayoutDashboard className="h-12 w-12" />}
            title="Dashboard not found"
            description="The dashboard you're looking for doesn't exist or you don't have access."
            action={
              <Button onClick={() => router.push("/")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboards
              </Button>
            }
          />
        </div>
      )}

      {!isLoading && dashboard && (
        <>
          {saveError && (
            <div className="px-6 pt-2">
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            </div>
          )}

          <PageTabs
            pages={layout.pages}
            activeIndex={activePageIndex}
            editable
            onSelect={handleSelectPage}
            onAdd={addPage}
            onRemove={removePage}
            onRename={renamePage}
            onReorder={handleReorderPages}
          />

          <WidgetEditorModal
            open={editorOpen}
            onOpenChange={(open) => {
              setEditorOpen(open);
              if (!open && pendingTemplateId) {
                setPendingTemplateId(undefined);
                // Clean up the templateId search param from the URL
                router.replace(`/${id}/edit`, { scroll: false });
              }
            }}
            mode={editorMode}
            widget={editingWidget}
            connections={connections ?? []}
            onSave={handleEditorSave}
            layout={layout}
            initialTemplate={
              pendingTemplateId ? templateMap[pendingTemplateId] : undefined
            }
            initialPreviewData={
              editorMode === "edit" ? cachedPreviewData : undefined
            }
            canWrite={session?.user?.canWrite !== false}
          />

          {templateWidget &&
            (() => {
              const conn = (connections ?? []).find(
                (c) => c.id === templateWidget.connectionId,
              );
              // Content-only widgets (markdown, iframe) have no connection;
              // default to "postgresql" so the template dialog still opens.
              const connectorType: ConnectorType = conn
                ? conn.type
                : "postgresql";
              return (
                <SaveTemplateDialog
                  open={true}
                  onOpenChange={(open) => {
                    if (!open) setTemplateWidget(undefined);
                  }}
                  widget={templateWidget}
                  connectorType={connectorType}
                />
              );
            })()}

          <div
            ref={gridContainerRef}
            className="flex-1 p-6 relative max-w-[1600px] mx-auto w-full"
          >
            {layout.pages.map((page, index) => {
              const isActive = index === activePageIndex;
              if (page.widgets.length === 0 && isActive) {
                return (
                  <EmptyState
                    key={page.id}
                    icon={<LayoutDashboard className="h-12 w-12" />}
                    title="No widgets yet"
                    description='Click "Add Widget" to get started.'
                    action={
                      <Button onClick={openAddWidget}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Widget
                      </Button>
                    }
                  />
                );
              }
              if (page.widgets.length === 0) return null;
              if (!isActive && !visitedPages.has(index)) return null;
              return (
                <div
                  key={page.id}
                  className={isActive ? undefined : "hidden"}
                  aria-hidden={!isActive}
                >
                  <DashboardContainer
                    page={page}
                    editable
                    actions={{
                      onRemoveWidget: removeWidget,
                      onEditWidget: openEditWidget,
                      onDuplicateWidget: duplicateWidget,
                      onLayoutChange: isActive ? updateGridLayout : undefined,
                      onWidgetSettingsChange: (widgetId, settings) => {
                        const target = page.widgets.find(
                          (w) => w.id === widgetId,
                        );
                        if (target)
                          updateWidget(widgetId, { ...target, settings });
                      },
                      onNavigateToPage: handleNavigateToPage,
                      onSaveAsTemplate: setTemplateWidget,
                      onSyncWidget: handleSyncWidget,
                      onDetachWidget: handleDetachWidget,
                    }}
                    templateMap={templateMap}
                    showParameterBar={effectiveShowBar}
                    parameterSourceMap={parameterSourceMap}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      <ConfirmDialog
        open={showNavWarning}
        onOpenChange={setShowNavWarning}
        title="Unsaved changes"
        description="You have unsaved changes. Are you sure you want to leave? Your changes will be lost."
        confirmText="Leave"
        cancelText="Stay"
        variant="destructive"
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
      />
    </div>
  );
}
