"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import {
  Button,
  SettingRow,
  Switch,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@neoboard/components";
import { Info } from "lucide-react";

export interface InteractionSectionProps {
  clickActionCollisions: { widgetId: string; title: string }[];
}

/** Behavior → Interaction: what a click on the widget does (#2388). */
export function InteractionSection({
  clickActionCollisions,
}: Readonly<InteractionSectionProps>) {
  const clickActionEnabled = useWidgetEditorStore((s) => s.clickActionEnabled);
  const setClickActionEnabled = useWidgetEditorStore(
    (s) => s.setClickActionEnabled,
  );
  const actionRules = useWidgetEditorStore((s) => s.actionRules);
  const setDialogStep = useWidgetEditorStore((s) => s.setDialogStep);

  return (
    <>
      <SettingRow
        label="Click action"
        htmlFor="click-action-enabled"
        help="Sets a parameter or opens a page on click."
        compact
      >
        <Switch
          stateLabel
          id="click-action-enabled"
          checked={clickActionEnabled}
          onCheckedChange={setClickActionEnabled}
        />
      </SettingRow>
      {clickActionEnabled && (
        <SettingRow
          label="Rules"
          help={
            actionRules.length === 0
              ? "No action rules configured."
              : `${actionRules.length} action rule(s) configured.`
          }
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDialogStep("rules")}
          >
            Manage Action Rules
          </Button>
        </SettingRow>
      )}
      {clickActionEnabled && clickActionCollisions.length > 0 && (
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
    </>
  );
}
