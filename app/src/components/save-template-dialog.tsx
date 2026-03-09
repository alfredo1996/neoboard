"use client";

import { useState } from "react";
import type { DashboardWidget } from "@/lib/db/schema";
import { useCreateWidgetTemplate } from "@/hooks/use-widget-templates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  LoadingButton,
  Input,
  Label,
  Textarea,
} from "@neoboard/components";
import { getChartConfig } from "@/lib/chart-registry";

interface SaveTemplateDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly widget: DashboardWidget;
  readonly connectorType: "neo4j" | "postgresql";
  readonly onSaved?: () => void;
}

export function SaveTemplateDialog({
  open,
  onOpenChange,
  widget,
  connectorType,
  onSaved,
}: SaveTemplateDialogProps) {
  const defaultName =
    (widget.settings?.title as string) ||
    getChartConfig(widget.chartType)?.label ||
    widget.chartType;

  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createTemplate = useCreateWidgetTemplate();

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName(defaultName);
      setDescription("");
      setTagsInput("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSave() {
    setError(null);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      await createTemplate.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        chartType: widget.chartType,
        connectorType,
        connectionId: widget.connectionId || undefined,
        query: widget.query,
        params: widget.params,
        settings: widget.settings
          ? { ...widget.settings, connectionId: undefined }
          : undefined,
      });
      onSaved?.();
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Save to Widget Lab</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-description">
              Description{" "}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this template do?"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-tags">
              Tags{" "}
              <span className="text-muted-foreground text-xs">
                (optional, comma-separated)
              </span>
            </Label>
            <Input
              id="template-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. neo4j, monitoring, kpi"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <LoadingButton
            disabled={!name.trim()}
            loading={createTemplate.isPending}
            loadingText="Saving..."
            onClick={handleSave}
          >
            Save Template
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
