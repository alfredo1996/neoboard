/**
 * Lets a caller that renders its own label name a parameter widget (#1410).
 *
 * The widgets were built for the parameter bar, where the raw parameter name
 * is the label. A form field already shows the author's label, so rendering
 * the parameter name too labels the control twice — and names it after an
 * internal identifier.
 */
export interface ExternalLabelProps {
  /**
   * Id of the caller's label, optionally followed by space-separated ids that
   * only the control's own name includes (such as "(optional)"). The widget then renders no label of its own and
   * names its control from this one.
   */
  labelledBy?: string;
  /** Id for the widget's control, so the caller's label `htmlFor` resolves to it. */
  id?: string;
  /** Id of the caller's error or help text; joined to the control's own. */
  describedBy?: string;
  /** The caller's error is showing: sets `aria-invalid` on the control. */
  invalid?: boolean;
}

/** Joins the ids a control is described by, or `undefined` when there are none. */
export function joinIds(...ids: (string | undefined)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

/** The label's own id out of a `labelledBy` list, without the extra ids after it. */
export function labelIdOf(labelledBy: string): string {
  return labelledBy.split(" ")[0];
}

/**
 * Names a secondary control — a clear button, a range's min input — after the
 * caller's label plus a qualifier word, so it is never named after the
 * parameter name when labelled externally. `qualifierId` is a hidden span the
 * widget renders holding that word; `qualifierFirst` reads it before the label.
 */
export function qualifiedName(
  labelledBy: string | undefined,
  qualifierId: string,
  fallback: string,
  qualifierFirst = false,
): { "aria-label": string } | { "aria-labelledby": string } {
  if (!labelledBy) return { "aria-label": fallback };
  // `labelledBy` may list more ids after the label's own (the "(optional)"
  // marker, #2217); a composed name takes the label alone.
  const labelId = labelIdOf(labelledBy);
  return {
    "aria-labelledby": qualifierFirst
      ? `${qualifierId} ${labelId}`
      : `${labelId} ${qualifierId}`,
  };
}
