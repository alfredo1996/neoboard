/**
 * A parameter with no usable value: unset, null, "" or []. `0` and `false`
 * are values. One predicate for the query gate and the widget title, so the
 * title brackets the name exactly when the body waits (#2214).
 */
export function isParamUnset(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}
