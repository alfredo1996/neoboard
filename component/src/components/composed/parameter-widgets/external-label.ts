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
