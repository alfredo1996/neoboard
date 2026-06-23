/**
 * Normalize a user-supplied parameter name (#1055).
 *
 * Parameters are consumed as `$param_<name>`, so a user who names a parameter
 * `param_status` would otherwise produce a doubled `$param_param_status` token
 * and a `PARAM_STATUS` label. Strip a single leading `param_` (case-insensitive)
 * so the consumed token and label are clean.
 */
export function normalizeParamName(name: string): string {
  return name.replace(/^param_/i, "");
}
