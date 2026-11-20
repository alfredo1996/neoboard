"use client";

import { Button } from "@neoboard/components";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import type { Concept } from "@/hooks/use-concepts";

/**
 * Starts a selector from a concept (#2485): the selector is named after it and
 * sets its parameter. Only the plain name is stored, as a hand-made selector
 * stores it, so the dashboard never reads the concept at run time.
 */
export function ConceptSelectorStart({
  concepts,
  onPick,
}: Readonly<{
  concepts: readonly Concept[];
  onPick: (concept: Concept) => void;
}>) {
  const setTitle = useWidgetEditorStore((s) => s.setTitle);
  const setParamWidgetName = useWidgetEditorStore((s) => s.setParamWidgetName);
  if (concepts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="concept-selector-start">
      {concepts.map((c) => (
        <Button
          key={c.id}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setTitle(c.name);
            setParamWidgetName(c.parameter);
            onPick(c);
          }}
        >
          New selector for {c.name}
        </Button>
      ))}
    </div>
  );
}
