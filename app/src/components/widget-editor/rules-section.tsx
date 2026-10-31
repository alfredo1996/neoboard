"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { Button, SettingRow, Switch } from "@neoboard/components";

/** Style → Rules: color a mark or cell from its value (#2388). */
export function RulesSection() {
  const stylingEnabled = useWidgetEditorStore((s) => s.stylingEnabled);
  const setStylingEnabled = useWidgetEditorStore((s) => s.setStylingEnabled);
  const stylingRules = useWidgetEditorStore((s) => s.stylingRules);
  const setDialogStep = useWidgetEditorStore((s) => s.setDialogStep);

  return (
    <>
      <SettingRow
        label="Rule-based styling"
        htmlFor="styling-enabled"
        help="Color a mark or cell from its value."
        compact
      >
        <Switch
          stateLabel
          id="styling-enabled"
          checked={stylingEnabled}
          onCheckedChange={setStylingEnabled}
        />
      </SettingRow>
      {stylingEnabled && (
        <SettingRow
          label="Rules"
          help={
            stylingRules.length === 0
              ? "No styling rules configured."
              : `${stylingRules.length} styling rule(s) configured.`
          }
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDialogStep("styling-rules")}
          >
            Manage Styling Rules
          </Button>
        </SettingRow>
      )}
    </>
  );
}
