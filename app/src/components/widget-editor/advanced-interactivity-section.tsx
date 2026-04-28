"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import {
  Checkbox,
  Label,
  Button,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@neoboard/components";
import { Info } from "lucide-react";

export interface AdvancedInteractivitySectionProps {
  clickActionCollisions: { widgetId: string; title: string }[];
}

export function AdvancedInteractivitySection({
  clickActionCollisions,
}: AdvancedInteractivitySectionProps) {
  const clickActionEnabled = useWidgetEditorStore((s) => s.clickActionEnabled);
  const setClickActionEnabled = useWidgetEditorStore(
    (s) => s.setClickActionEnabled,
  );
  const actionRules = useWidgetEditorStore((s) => s.actionRules);
  const setDialogStep = useWidgetEditorStore((s) => s.setDialogStep);

  return (
    <div className="space-y-4 border-t pt-4">
      <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
        Interactivity
      </h4>
      <div className="flex items-center gap-2">
        <Checkbox
          id="click-action-enabled"
          checked={clickActionEnabled}
          onCheckedChange={(checked) => setClickActionEnabled(!!checked)}
        />
        <Label htmlFor="click-action-enabled" className="text-sm">
          Enable click action
        </Label>
      </div>
      {clickActionEnabled && (
        <div className="space-y-3 pl-6">
          <p className="text-sm text-muted-foreground">
            {actionRules.length === 0
              ? "No action rules configured."
              : `${actionRules.length} action rule(s) configured.`}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogStep("rules")}
          >
            Manage Action Rules
          </Button>
          {clickActionCollisions.length > 0 && (
            <Alert
              variant="default"
              className="py-2"
              data-testid="click-action-collision-banner"
            >
              <Info className="h-4 w-4" />
              <AlertTitle className="text-sm">
                Parameter name already in use
              </AlertTitle>
              <AlertDescription className="text-xs">
                {clickActionCollisions.length === 1
                  ? `A parameter set here is also set by: ${clickActionCollisions[0].title}.`
                  : `Parameters set here are also set by: ${clickActionCollisions.map((c) => c.title).join(", ")}.`}{" "}
                Multiple widgets writing to the same parameter may conflict.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
