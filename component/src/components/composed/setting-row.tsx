import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface SettingRowProps {
  /** The visible label, beside the control. */
  readonly label: React.ReactNode;
  /** Id of the control the label points at; omit when `labelId` names a group. */
  readonly htmlFor?: string;
  /** Id for the label, for a control named by `aria-labelledby`. */
  readonly labelId?: string;
  /** One line under the control, only where it adds a rule. */
  readonly help?: React.ReactNode;
  /** Id for the help, so the control can point at it. */
  readonly helpId?: string;
  /**
   * A segmented control has a width of its own: the row lets it drop under the
   * label when it does not fit, where other controls fill the column.
   */
  readonly wraps?: boolean;
  /** A lone switch sits a little lower to line up with the label. */
  readonly compact?: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * One line of the widget editor (#2388): the label on the left, a control sized
 * to its value on the right, and help under the control only where it adds a
 * rule. Rows sit 12px apart; the group around them carries the heading.
 */
function SettingRow({
  label,
  htmlFor,
  labelId,
  help,
  helpId,
  wraps = false,
  compact = false,
  className,
  children,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        "min-h-9 items-start gap-x-4",
        wraps ? "flex flex-wrap" : "grid grid-cols-[128px_minmax(0,1fr)]",
        className,
      )}
    >
      <Label
        id={labelId}
        htmlFor={htmlFor}
        className={cn("pt-2.5", wraps && "w-32 shrink-0")}
      >
        {label}
      </Label>
      <div
        className={cn(
          "grid min-w-0 justify-items-start gap-1",
          compact && "pt-2",
        )}
      >
        {children}
        {help && (
          <p
            id={helpId}
            className="w-0 min-w-full text-meta text-muted-foreground"
          >
            {help}
          </p>
        )}
      </div>
    </div>
  );
}

export { SettingRow };
