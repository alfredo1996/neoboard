"use client";

import { use, useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save, LayoutDashboard, Play, ChevronLeft } from "lucide-react";
import { useDashboard, useUpdateDashboard } from "@/hooks/use-dashboards";
import { useConnections } from "@/hooks/use-connections";
import { useQueryExecution } from "@/hooks/use-query-execution";
import { useDashboardStore } from "@/stores/dashboard-store";
import { DashboardContainer } from "@/components/dashboard-container";
import { CardContainer } from "@/components/card-container";
import type { DashboardWidget, GridLayoutItem } from "@/lib/db/schema";
import {
  Button,
  Label,
  Skeleton,
  Textarea,
  Alert,
  AlertDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@neoboard/components";
import {
  EmptyState,
  LoadingButton,
  Toolbar,
  ToolbarSection,
  ToolbarSeparator,
  ChartTypePicker,
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
  const { layout, setLayout, addWidget, removeWidget, updateGridLayout } =
    useDashboardStore();

  const [showAddWidget, setShowAddWidget] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [newWidgetType, setNewWidgetType] = useState<string>("bar");
  const [newWidgetQuery, setNewWidgetQuery] = useState("");
  const [newWidgetConnection, setNewWidgetConnection] = useState("");

  const previewQuery = useQueryExecution();

  // Load dashboard layout into store
  useEffect(() => {
    if (dashboard?.layoutJson) {
      setLayout(dashboard.layoutJson);
    }
  }, [dashboard, setLayout]);

  const handleSave = useCallback(async () => {
    await updateDashboard.mutateAsync({ id, layoutJson: layout });
  }, [id, layout, updateDashboard]);

  function resetWizard() {
    setWizardStep(1);
    setNewWidgetType("bar");
    setNewWidgetQuery("");
    setNewWidgetConnection("");
    previewQuery.reset();
  }

  function openAddWidget() {
    resetWizard();
    setShowAddWidget(true);
  }

  function handleAddWidget() {
    const widgetId = crypto.randomUUID();
    const widget: DashboardWidget = {
      id: widgetId,
      chartType: newWidgetType,
      connectionId: newWidgetConnection,
      query: newWidgetQuery,
    };
    const gridItem: GridLayoutItem = {
      i: widgetId,
      x: (layout.gridLayout.length * 4) % 12,
      y: Infinity,
      w: 4,
      h: 3,
    };
    addWidget(widget, gridItem);
    setShowAddWidget(false);
  }

  function handlePreview() {
    previewQuery.mutate({
      connectionId: newWidgetConnection,
      query: newWidgetQuery,
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

      {/* Two-step Add Widget dialog */}
      <Dialog open={showAddWidget} onOpenChange={(open) => {
        if (!open) setShowAddWidget(false);
      }}>
        <DialogContent className={wizardStep === 2 ? "sm:max-w-2xl" : "sm:max-w-md"}>
          {wizardStep === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle>Add Widget — Select Type</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Chart Type</Label>
                  <ChartTypePicker
                    value={newWidgetType}
                    onValueChange={setNewWidgetType}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Connection</Label>
                  <Select
                    value={newWidgetConnection}
                    onValueChange={setNewWidgetConnection}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a connection..." />
                    </SelectTrigger>
                    <SelectContent>
                      {connections?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddWidget(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!newWidgetConnection}
                  onClick={() => setWizardStep(2)}
                >
                  Next
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add Widget — Write Query</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="widget-query">Query</Label>
                  <Textarea
                    id="widget-query"
                    value={newWidgetQuery}
                    onChange={(e) => setNewWidgetQuery(e.target.value)}
                    placeholder="MATCH (n) RETURN n.name AS name, n.born AS value LIMIT 10"
                    className="font-mono min-h-[120px]"
                    rows={5}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <LoadingButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={previewQuery.isPending}
                    loadingText="Running..."
                    disabled={!newWidgetQuery.trim()}
                    onClick={handlePreview}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Show Preview
                  </LoadingButton>
                </div>

                {previewQuery.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {previewQuery.error.message}
                    </AlertDescription>
                  </Alert>
                )}

                {previewQuery.data && (
                  <div className="border rounded-lg overflow-hidden h-[250px]">
                    <CardContainer
                      widget={{
                        id: "preview",
                        chartType: newWidgetType,
                        connectionId: newWidgetConnection,
                        query: newWidgetQuery,
                      }}
                      previewData={previewQuery.data.data}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setWizardStep(1);
                    previewQuery.reset();
                  }}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={!newWidgetQuery.trim()}
                  onClick={handleAddWidget}
                >
                  Add Widget
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
            onLayoutChange={updateGridLayout}
          />
        )}
      </div>
    </div>
  );
}
