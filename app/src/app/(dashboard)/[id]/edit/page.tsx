"use client";

import { use, useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save, LayoutDashboard } from "lucide-react";
import { useDashboard, useUpdateDashboard } from "@/hooks/use-dashboards";
import { useConnections } from "@/hooks/use-connections";
import { useDashboardStore } from "@/stores/dashboard-store";
import { DashboardContainer } from "@/components/dashboard-container";
import { WidgetEditorModal } from "@/components/widget-editor-modal";
import type { DashboardWidget, GridLayoutItem } from "@/lib/db/schema";
import {
  Button,
  Skeleton,
  Alert,
  AlertDescription,
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
  const { data: dashboard, isLoading } = useDashboard(id);
  const { data: connections } = useConnections();
  const updateDashboard = useUpdateDashboard();
  const { layout, setLayout, addWidget, removeWidget, updateWidget, updateGridLayout } =
    useDashboardStore();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("add");
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | undefined>();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load dashboard layout into store
  useEffect(() => {
    if (dashboard?.layoutJson) {
      setLayout(dashboard.layoutJson);
    }
  }, [dashboard, setLayout]);

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
        x: (layout.gridLayout.length * 4) % 12,
        y: Infinity,
        w: 4,
        h: 3,
      };
      addWidget(widget, gridItem);
    } else {
      updateWidget(widget.id, widget);
    }
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
          <h1 className="text-lg font-bold">
            Editing: {dashboard.name}
          </h1>
        </ToolbarSection>
        <ToolbarSection>
          <Button
            variant="outline"
            size="sm"
            onClick={openAddWidget}
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

      <WidgetEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        widget={editingWidget}
        connections={connections ?? []}
        onSave={handleEditorSave}
      />

      <div className="flex-1 p-6">
        {layout.widgets.length === 0 ? (
          <EmptyState
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
        ) : (
          <DashboardContainer
            layout={layout}
            editable
            onRemoveWidget={removeWidget}
            onEditWidget={openEditWidget}
            onLayoutChange={updateGridLayout}
          />
        )}
      </div>
    </div>
  );
}
