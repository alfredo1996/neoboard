"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { Input, Label } from "@neoboard/components";

export function LabMetadataForm() {
  const labName = useWidgetEditorStore((s) => s.labName);
  const setLabName = useWidgetEditorStore((s) => s.setLabName);
  const labDescription = useWidgetEditorStore((s) => s.labDescription);
  const setLabDescription = useWidgetEditorStore((s) => s.setLabDescription);
  const labTagsInput = useWidgetEditorStore((s) => s.labTagsInput);
  const setLabTagsInput = useWidgetEditorStore((s) => s.setLabTagsInput);

  return (
    <div className="space-y-3 mb-4 pb-4 border-b">
      <div className="space-y-1.5">
        <Label htmlFor="lab-template-name">
          Template Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="lab-template-name"
          value={labName}
          onChange={(e) => setLabName(e.target.value)}
          placeholder="My chart template"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lab-template-desc">
          Description{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="lab-template-desc"
          value={labDescription}
          onChange={(e) => setLabDescription(e.target.value)}
          placeholder="What does this template do?"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lab-template-tags">
          Tags{" "}
          <span className="text-muted-foreground text-xs">
            (comma-separated)
          </span>
        </Label>
        <Input
          id="lab-template-tags"
          value={labTagsInput}
          onChange={(e) => setLabTagsInput(e.target.value)}
          placeholder="e.g. neo4j, monitoring, kpi"
        />
      </div>
    </div>
  );
}
