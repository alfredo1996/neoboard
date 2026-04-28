"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { Checkbox, Label, Button } from "@neoboard/components";

export function AdvancedStylingSection() {
  const stylingEnabled = useWidgetEditorStore((s) => s.stylingEnabled);
  const setStylingEnabled = useWidgetEditorStore((s) => s.setStylingEnabled);
  const stylingRules = useWidgetEditorStore((s) => s.stylingRules);
  const setDialogStep = useWidgetEditorStore((s) => s.setDialogStep);

  return (
    <div className="space-y-4 border-t pt-4">
      <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
        Styling
      </h4>
      <div className="flex items-center gap-2">
        <Checkbox
          id="styling-enabled"
          checked={stylingEnabled}
          onCheckedChange={(checked) => setStylingEnabled(!!checked)}
        />
        <Label htmlFor="styling-enabled" className="text-sm">
          Enable rule-based styling
        </Label>
      </div>
      {stylingEnabled && (
        <div className="space-y-3 pl-6">
          <p className="text-sm text-muted-foreground">
            {stylingRules.length === 0
              ? "No styling rules configured."
              : `${stylingRules.length} styling rule(s) configured.`}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogStep("styling-rules")}
          >
            Manage Styling Rules
          </Button>
        </div>
      )}
    </div>
  );
}
