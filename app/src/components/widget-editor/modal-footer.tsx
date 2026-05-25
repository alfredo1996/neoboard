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

  return (
    <DialogFooter>
      {labError && (
        <p className="text-sm text-destructive mr-auto">{labError}</p>
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
