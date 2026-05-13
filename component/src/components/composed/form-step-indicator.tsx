"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FormStepIndicatorProps {
  /** Labels for each step */
  stepLabels: string[];
  /** Current active step index (0-based) */
  currentStep: number;
  /** Callback when a completed step is clicked */
  onStepClick?: (step: number) => void;
}

/**
 * Step indicator for multi-step form wizards.
 * Shows completed, current, and upcoming steps.
 * Completed steps are clickable to navigate back.
 */
function FormStepIndicator({
  stepLabels,
  currentStep,
  onStepClick,
}: FormStepIndicatorProps) {
  return (
    <nav
      aria-label="Form steps"
      className="flex items-center gap-1 mb-4"
      data-testid="form-step-indicator"
    >
      {stepLabels.map((label, idx) => {
        const isCompleted = idx < currentStep;
        const isCurrent = idx === currentStep;

        return (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <div
                className={cn(
                  "h-px flex-1 min-w-2",
                  isCompleted ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <button
              type="button"
              disabled={!isCompleted}
              onClick={
                isCompleted && onStepClick ? () => onStepClick(idx) : undefined
              }
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium whitespace-nowrap rounded-full px-2.5 py-1 transition-colors",
                isCurrent && "bg-primary text-primary-foreground",
                isCompleted &&
                  "bg-primary/10 text-primary cursor-pointer hover:bg-primary/20",
                !isCurrent &&
                  !isCompleted &&
                  "bg-muted text-muted-foreground cursor-default",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  isCurrent && "bg-primary-foreground/20",
                  isCompleted && "bg-primary/20",
                  !isCurrent && !isCompleted && "bg-muted-foreground/20",
                )}
              >
                {isCompleted ? "✓" : idx + 1}
              </span>
              {label}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export { FormStepIndicator };
