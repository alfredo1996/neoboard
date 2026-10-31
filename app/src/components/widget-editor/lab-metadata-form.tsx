"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { Input, Field } from "@neoboard/components";

export function LabMetadataForm() {
  const labName = useWidgetEditorStore((s) => s.labName);
  const setLabName = useWidgetEditorStore((s) => s.setLabName);
  const labDescription = useWidgetEditorStore((s) => s.labDescription);
  const setLabDescription = useWidgetEditorStore((s) => s.setLabDescription);
  const labTagsInput = useWidgetEditorStore((s) => s.labTagsInput);
  const setLabTagsInput = useWidgetEditorStore((s) => s.setLabTagsInput);

  return (
    <div className="grid gap-3">
      <Field label="Template Name" id="lab-template-name">
        <Input
          value={labName}
          onChange={(e) => setLabName(e.target.value)}
          placeholder="My chart template"
        />
      </Field>
      <Field label="Description" optional id="lab-template-desc">
        <Input
          value={labDescription}
          onChange={(e) => setLabDescription(e.target.value)}
          placeholder="What does this template do?"
        />
      </Field>
      <Field
        label="Tags"
        optional
        help="Comma-separated."
        id="lab-template-tags"
      >
        <Input
          value={labTagsInput}
          onChange={(e) => setLabTagsInput(e.target.value)}
          placeholder="e.g. sales, monitoring, kpi"
        />
      </Field>
    </div>
  );
}
