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
   * Id of the caller's label. The widget then renders no label of its own and
   * names its control from this one.
   */
  labelledBy?: string;
  /** Id for the widget's control, so the caller's label `htmlFor` resolves to it. */
  id?: string;
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
): { "aria-label"?: string; "aria-labelledby"?: string } {
  if (!labelledBy) return { "aria-label": fallback };
  return {
    "aria-labelledby": qualifierFirst
      ? `${qualifierId} ${labelledBy}`
      : `${labelledBy} ${qualifierId}`,
  };
}
