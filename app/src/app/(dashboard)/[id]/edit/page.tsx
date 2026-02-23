"use client";

import { use, useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Plus, Save, LayoutDashboard, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDashboard, useUpdateDashboard } from "@/hooks/use-dashboards";
import { useConnections } from "@/hooks/use-connections";
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAdmin = (session?.user as any)?.role === "admin";

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
  const addWidget = useDashboardStore((s) => s.addWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const updateWidget = useDashboardStore((s) => s.updateWidget);
  const updateGridLayout = useDashboardStore((s) => s.updateGridLayout);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("add");
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | undefined>();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load dashboard layout into store (migrates v1 → v2 if needed)
  useEffect(() => {
    if (dashboard?.layoutJson) {
      setLayout(migrateLayout(dashboard.layoutJson));
    }
  }, [dashboard, setLayout]);

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

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!dashboard) {
    return (
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
    );
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
          <h1 className="text-lg font-bold">Editing: {dashboard.name}</h1>
        </ToolbarSection>
        <ToolbarSection>
          {isAdmin && (
            <>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Users className="mr-2 h-4 w-4" />
                    Assignments
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>User Assignments</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <DashboardAssignPanel dashboardId={id} />
                  </div>
                </SheetContent>
              </Sheet>
              <ToolbarSeparator />
            </>
          )}
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
        </ToolbarSection>
      </Toolbar>

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
        onSelect={setActivePage}
        onAdd={addPage}
        onRemove={removePage}
        onRename={renamePage}
      />

      <WidgetEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        widget={editingWidget}
        connections={connections ?? []}
        onSave={handleEditorSave}
      />

      <div className="flex-1 p-6 relative">
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
                onLayoutChange={isActive ? updateGridLayout : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
