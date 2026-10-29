"use client";

import React from "react";
import { FilePlus, Plus, Save } from "lucide-react";
import { ShortcutHint } from "@/components/shortcut-hint";
import { DashboardMeta } from "@/components/dashboard-meta";
import { DashboardShareSheet } from "@/components/dashboard-share-sheet";
import { crumbClick } from "@/lib/crumb-click";
import { PageHeader } from "@neoboard/components/kit";
import { Button, LoadingButton } from "@neoboard/components";

interface DashboardEditToolbarProps {
  dashboardId: string;
  name: string;
  updatedAt: string | Date;
  updatedByName?: string | null;
  widgetCount: number;
  /** The page tabs, under the title: only when there are 2+ pages. */
  tabs?: React.ReactNode;
  /** The Filters button; first in the actions, absent on a dashboard with no filters (#2297). */
  filters?: React.ReactNode;
  /** Given while the dashboard has one page and so no tabs row. */
  onAddPage?: () => void;
  /** Admins get the sharing sheet. */
  isAdmin: boolean;
  isPublic: boolean;
  onTogglePublic: (value: boolean) => void;
  isSaving: boolean;
  onAddWidget: () => void;
  onSave: () => void;
  /** Cancel: leave edit mode without saving (⌘E); the caller asks first when dirty. */
  onCancel: () => void;
  /** The "Dashboards" crumb. */
  onDashboards: () => void;
  /** The dashboard's own crumb: back to view mode. */
  onLeave: () => void;
}

/**
 * Edit-mode page header: breadcrumb, name, meta, sharing, Add Widget, Save.
 * Its height matches the view header's: the name stays on one line and the
 * "Editing" crumb says the mode.
 */
export function DashboardEditToolbar({
  dashboardId,
  name,
  updatedAt,
  updatedByName,
  widgetCount,
  tabs,
  filters,
  onAddPage,
  isAdmin,
  isPublic,
  onTogglePublic,
  isSaving,
  onAddWidget,
  onSave,
  onCancel,
  onDashboards,
  onLeave,
}: Readonly<DashboardEditToolbarProps>) {
  return (
    <PageHeader
      breadcrumb={[
        {
          label: "Dashboards",
          href: "/",
          onClick: crumbClick(onDashboards),
        },
        {
          label: name,
          href: `/${dashboardId}`,
          onClick: crumbClick(onLeave),
        },
        { label: "Editing" },
      ]}
      title={name}
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
          {filters}
          {isAdmin && (
            <DashboardShareSheet
              dashboardId={dashboardId}
              isPublic={isPublic}
              onTogglePublic={onTogglePublic}
              label="Sharing"
            />
          )}
          {onAddPage && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onAddPage}
              aria-label="Add page"
            >
              <FilePlus className="h-4 w-4 lg:mr-2" />
              <span className="hidden lg:inline">Add page</span>
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onAddWidget}
            title="Add widget (Cmd+Shift+N)"
            aria-label="Add Widget"
          >
            <Plus className="h-4 w-4 lg:mr-2" />
            {/* Icon-only below lg and no hints below xl: the actions must not wrap the header taller (#2352). */}
            <span className="hidden lg:inline">Add Widget</span>
            <span className="hidden xl:contents">
              <ShortcutHint combo="Cmd+Shift+N" />
            </span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            title="Leave without saving (Cmd+E)"
          >
            Cancel
            <span className="hidden xl:contents">
              <ShortcutHint combo="Cmd+E" />
            </span>
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
            <span className="hidden xl:contents">
              <ShortcutHint combo="Cmd+S" />
            </span>
          </LoadingButton>
        </>
      }
    />
  );
}
