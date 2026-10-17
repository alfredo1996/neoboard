"use client";

import React from "react";
import { Plus, Save, Users } from "lucide-react";
import { ShortcutHint } from "@/components/shortcut-hint";
import { DashboardAssignPanel } from "@/components/dashboard-assign-panel";
import { DashboardFiltersButton } from "@/components/dashboard-filters-button";
import { DashboardMeta } from "@/components/dashboard-meta";
import { PageHeader } from "@neoboard/components/kit";
import {
  Button,
  LoadingButton,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@neoboard/components";

interface DashboardEditToolbarProps {
  dashboardId: string;
  name: string;
  updatedAt: string | Date;
  updatedByName?: string | null;
  widgetCount: number;
  /** The page tabs, under the title. */
  tabs?: React.ReactNode;
  hasParameters: boolean;
  parameterCount: number;
  showParameterBar: boolean;
  onToggleParameterBar: () => void;
  /** Admins get the sharing sheet. */
  isAdmin: boolean;
  isPublic: boolean;
  onTogglePublic: (value: boolean) => void;
  isSaving: boolean;
  onAddWidget: () => void;
  onSave: () => void;
  /** The "Dashboards" crumb. */
  onDashboards: () => void;
  /** The dashboard's own crumb: back to view mode. */
  onLeave: () => void;
}

/** Edit-mode page header: breadcrumb, title, meta, sharing, Add Widget, Save. */
export function DashboardEditToolbar({
  dashboardId,
  name,
  updatedAt,
  updatedByName,
  widgetCount,
  tabs,
  hasParameters,
  parameterCount,
  showParameterBar,
  onToggleParameterBar,
  isAdmin,
  isPublic,
  onTogglePublic,
  isSaving,
  onAddWidget,
  onSave,
  onDashboards,
  onLeave,
}: Readonly<DashboardEditToolbarProps>) {
  return (
    <PageHeader
      breadcrumb={[
        {
          label: "Dashboards",
          href: "/",
          onClick: (e) => {
            e.preventDefault();
            onDashboards();
          },
        },
        {
          label: name,
          href: `/${dashboardId}`,
          onClick: (e) => {
            e.preventDefault();
            onLeave();
          },
        },
        { label: "Editing" },
      ]}
      title={`Editing: ${name}`}
      meta={
        <DashboardMeta
          updatedAt={updatedAt}
          updatedByName={updatedByName}
          widgetCount={widgetCount}
          isPublic={isPublic}
        />
      }
      tabs={tabs}
      actions={
        <>
          {isAdmin && (
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
                    dashboardId={dashboardId}
                    isPublic={isPublic}
                    onTogglePublic={onTogglePublic}
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}
          <DashboardFiltersButton
            hasParameters={hasParameters}
            parameterCount={parameterCount}
            showParameterBar={showParameterBar}
            onToggleParameterBar={onToggleParameterBar}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onAddWidget}
            title="Add widget (Cmd+Shift+N)"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Widget
            <ShortcutHint combo="Cmd+Shift+N" />
          </Button>
          <LoadingButton
            size="sm"
            loading={isSaving}
            loadingText="Saving..."
            onClick={onSave}
            title="Save dashboard (Cmd+S)"
          >
            <Save className="mr-2 h-4 w-4" />
            Save
            <ShortcutHint combo="Cmd+S" />
          </LoadingButton>
        </>
      }
    />
  );
}
