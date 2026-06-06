"use client";

import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { Button, LoadingButton, DialogFooter } from "@neoboard/components";

export interface ModalFooterProps {
  mode: "add" | "edit" | "lab-edit" | "lab-create";
  labError: string | null;
  labSaving: boolean;
  saveStatus: "idle" | "saving" | "saved";
  isContentOnly: boolean;
  onCancel: () => void;
  onSave: () => void;
  onLabSave: () => void;
  /**
   * Optional. When provided in "edit" mode, renders a left-aligned
   * "Save as new template" secondary button that fires this callback (#913).
   * The button clones the current widget config into a new template via the
   * parent's SaveTemplateDialog flow.
   */
  onSaveAsTemplate?: () => void;
}

export function ModalFooter({
  mode,
  labError,
  labSaving,
  saveStatus,
  isContentOnly,
  onCancel,
  onSave,
  onLabSave,
  onSaveAsTemplate,
}: ModalFooterProps) {
  const chartType = useWidgetEditorStore((s) => s.chartType);
  const connectionId = useWidgetEditorStore((s) => s.connectionId);
  const query = useWidgetEditorStore((s) => s.query);
  const labName = useWidgetEditorStore((s) => s.labName);
  const paramWidgetName = useWidgetEditorStore((s) => s.paramWidgetName);
  const paramUIType = useWidgetEditorStore((s) => s.paramUIType);
  const chartOptions = useWidgetEditorStore((s) => s.chartOptions);

  const isParamSelect = chartType === "parameter-select";
  const isForm = chartType === "form";
  const isLabMode = mode === "lab-edit" || mode === "lab-create";

  // #913: "Save as new template" is offered only when editing an existing
  // dashboard widget — add mode has nothing saved yet, lab modes are already
  // template flows.
  const canSaveAsTemplate = mode === "edit" && onSaveAsTemplate !== undefined;

  return (
    <DialogFooter>
      {labError && (
        <p className="text-sm text-destructive mr-auto">{labError}</p>
      )}
      {canSaveAsTemplate && !labError && (
        <Button
          type="button"
          variant="outline"
          onClick={onSaveAsTemplate}
          className="mr-auto"
        >
          Save as new template
        </Button>
      )}
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      {isLabMode ? (
        <LoadingButton
          type="button"
          disabled={!labName.trim() || (!isContentOnly && !query.trim())}
          loading={labSaving}
          loadingText="Saving..."
          onClick={onLabSave}
        >
          {mode === "lab-edit" ? "Save Template" : "Create Template"}
        </LoadingButton>
      ) : (
        <LoadingButton
          type="button"
          disabled={
            isParamSelect
              ? !paramWidgetName.trim() ||
                ((paramUIType === "select" || paramUIType === "cascading") &&
                  (!connectionId ||
                    !String(chartOptions.seedQuery ?? "").trim()))
              : isContentOnly
                ? false
                : isForm
                  ? !connectionId || !query.trim()
                  : !query.trim()
          }
          loading={saveStatus === "saving"}
          loadingText="Saving..."
          onClick={onSave}
        >
          {saveStatus === "saved"
            ? "Saved!"
            : mode === "edit"
              ? "Save Changes"
              : "Add Widget"}
        </LoadingButton>
      )}
    </DialogFooter>
  );
}
