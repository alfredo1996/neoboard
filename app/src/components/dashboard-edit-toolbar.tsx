"use client";

import { ArrowLeft, Filter, Plus, Save, Users } from "lucide-react";
import { ShortcutHint } from "@/components/shortcut-hint";
import { DashboardAssignPanel } from "@/components/dashboard-assign-panel";
import {
  Button,
  LoadingButton,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Toolbar,
  ToolbarSection,
  ToolbarSeparator,
} from "@neoboard/components";

interface DashboardEditToolbarProps {
  dashboardId: string;
  name: string;
  /** Admins get the sharing sheet. */
  isAdmin: boolean;
  isPublic: boolean;
  onTogglePublic: (value: boolean) => void;
  hasParameters: boolean;
  parameterCount: number;
  showParameterBar: boolean;
  onToggleParameterBar: () => void;
  isSaving: boolean;
  onAddWidget: () => void;
  onSave: () => void;
  onBack: () => void;
}

/** Edit-mode chrome: sharing, parameter toggle, Add Widget, Save. */
export function DashboardEditToolbar({
  dashboardId,
  name,
  isAdmin,
  isPublic,
  onTogglePublic,
  hasParameters,
  parameterCount,
  showParameterBar,
  onToggleParameterBar,
  isSaving,
  onAddWidget,
  onSave,
  onBack,
}: DashboardEditToolbarProps) {
  return (
    <Toolbar>
      <ToolbarSection>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </ToolbarSection>
      <ToolbarSection className="flex-1">
        <h1 className="text-lg font-bold">{`Editing: ${name}`}</h1>
      </ToolbarSection>
      <ToolbarSection>
        {isAdmin && (
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
                    dashboardId={dashboardId}
                    isPublic={isPublic}
                    onTogglePublic={onTogglePublic}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <ToolbarSeparator />
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!hasParameters}
          onClick={onToggleParameterBar}
          aria-label={showParameterBar ? "Hide parameters" : "Show parameters"}
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
          onClick={onAddWidget}
          title="Add widget (Cmd+Shift+N)"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Widget
          <ShortcutHint combo="Cmd+Shift+N" />
        </Button>
        <ToolbarSeparator />
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
      </ToolbarSection>
    </Toolbar>
  );
}
