"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface MultiSelectItemProps {
  /**
   * cmdk's filter/identity string for this row. OMIT IT to keep cmdk's
   * `textContent` fallback — `data-grid-faceted-filter` relies on that, and
   * passing a machine value there would introduce the #1411 filtering bug
   * in the one surface that does not have it.
   */
  readonly value?: string;
  readonly isSelected: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean;
  /** Label plus any extras (icons, facet counts). */
  readonly children: React.ReactNode;
}

/**
 * One checkable row in a cmdk-backed multi-select (#1284).
 *
 * The checked state used to be carried only by the coloured box and its check
 * glyph — invisible to assistive tech (WCAG 1.4.1, 4.1.2). Worse, cmdk sets
 * `aria-selected` from its own HIGHLIGHT state, so the attribute was present
 * and wrong: true for the merely-hovered row, false for every checked one.
 *
 * cmdk spreads rest props BEFORE `role` and `aria-selected`, so neither can be
 * overridden through props. State is therefore carried in the option's
 * accessible name via an `sr-only` span, and the coloured box is marked
 * decorative. The alternative — `CommandItem asChild` wrapping an explicit
 * `<div role="option">` so Radix Slot lets child props win — is more fragile
 * and couples us to Slot's precedence rules, so it is deliberately not used.
 */
function MultiSelectItem({
  value,
  isSelected,
  onToggle,
  disabled,
  children,
}: MultiSelectItemProps) {
  return (
    <CommandItem asChild value={value} disabled={disabled} onSelect={onToggle}>
      {/* asChild so Radix Slot lets these props win: cmdk would otherwise
          drive role from its own state. Note aria-CHECKED, not aria-selected:
          cmdk uses aria-selected as its internal marker for the highlighted
          item, so overriding it breaks Enter-to-toggle. aria-checked is the
          correct attribute for a multi-selectable option anyway, and leaves
          cmdk's keyboard navigation intact. Carrying state in an sr-only span
          instead polluted the row's textContent, which is cmdk's filter key
          when `value` is omitted. */}
      <div role="option" aria-checked={isSelected}>
        <div
          data-slot="multi-select-indicator"
          aria-hidden="true"
          className={cn(
            "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
            isSelected ? "bg-primary text-primary-foreground" : "opacity-50",
          )}
        >
          {isSelected && <Check className="h-3 w-3" />}
        </div>
        {children}
      </div>
    </CommandItem>
  );
}

export { MultiSelectItem };
