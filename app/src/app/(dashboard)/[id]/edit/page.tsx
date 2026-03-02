"use client";

import { use, useEffect, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Plus, Save, LayoutDashboard, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDashboard, useUpdateDashboard } from "@/hooks/use-dashboards";
import { useConnections } from "@/hooks/use-connections";
import { useParameterStore } from "@/stores/parameter-store";
import { useDashboardStore } from "@/stores/dashboard-store";
import { DashboardContainer } from "@/components/dashboard-container";
import { PageTabs } from "@/components/page-tabs";
import { WidgetEditorModal } from "@/components/widget-editor-modal";
import { DashboardAssignPanel } from "@/components/dashboard-assign-panel";
import { migrateLayout } from "@/lib/migrate-layout";
import type { DashboardWidget, GridLayoutItem } from "@/lib/db/schema";
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
  EmptyState,
  LoadingButton,
  Toolbar,
  ToolbarSection,
  ToolbarSeparator,
} from "@neoboard/components";

export default function DashboardEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = use(params);
  const { page: pageParam } = use(searchParams);
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

  const initialPage = pageParam !== undefined ? parseInt(pageParam, 10) : 0;
  const [visitedPages, setVisitedPages] = useState<Set<number>>(
    () => new Set([isNaN(initialPage) ? 0 : initialPage])
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

  const handleNavigateToPage = useCallback(
    (pageId: string) => {
      const index = layout.pages.findIndex((p) => p.id === pageId);
      if (index >= 0) {
        markVisited(index);
        setActivePage(index);
      }
    },
    [layout.pages, setActivePage]
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("add");
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | undefined>();
  const [saveError, setSaveError] = useState<string | null>(null);

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
      await updateDashboard.mutateAsync({ id, layoutJson: layout });
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save dashboard"
      );
    }
  }, [id, layout, updateDashboard]);

  function openAddWidget() {
    setEditorMode("add");
    setEditingWidget(undefined);
    setEditorOpen(true);
  }

  function openEditWidget(widget: DashboardWidget) {
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
            onClick={() => router.push(`/${id}`)}
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
              <Button variant="outline" size="sm" onClick={openAddWidget}>
                <Plus className="mr-2 h-4 w-4" />
                Add Widget
              </Button>
              <ToolbarSeparator />
              <LoadingButton
                size="sm"
                loading={updateDashboard.isPending}
                loadingText="Saving..."
                onClick={handleSave}
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
            onOpenChange={setEditorOpen}
            mode={editorMode}
            widget={editingWidget}
            connections={connections ?? []}
            onSave={handleEditorSave}
            layout={layout}
          />

          <div className="flex-1 p-6 relative max-w-[1600px] mx-auto w-full">
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
                    onRemoveWidget={removeWidget}
                    onEditWidget={openEditWidget}
                    onDuplicateWidget={duplicateWidget}
                    onLayoutChange={isActive ? updateGridLayout : undefined}
                    onWidgetSettingsChange={(widgetId, settings) => {
                      const target = page.widgets.find((w) => w.id === widgetId);
                      if (target) {
                        updateWidget(widgetId, { ...target, settings });
                      }
                    }}
                    onNavigateToPage={handleNavigateToPage}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
