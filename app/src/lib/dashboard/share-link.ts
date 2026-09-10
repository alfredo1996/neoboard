import type { ParameterEntry } from "@/stores/parameter-store";
import { buildParamsUrl } from "@/lib/shared/url-params";

/**
 * Companion keys that range widgets write beside their parameter name
 * (`period_from`, `amount_max`, …). Mirrors `COMPANION_SUFFIXES` in
 * url-params.ts and `SUB_PARAM_SUFFIXES` in format-parameter-value.ts.
 */
const COMPANION_SUFFIX = /_(from|to|min|max)$/;

/**
 * The link "Copy link with current filters" puts on the clipboard, plus the
 * parameters it had to leave out.
 *
 * `syncable` is the per-widget "Sync to URL" allow-list (`extractSyncParams`);
 * a set parameter outside it is reported under its widget name so the user
 * can go and turn the toggle on. Cleared parameters are not reported — an
 * empty value is not something the link fails to carry.
 */
export function buildShareLink(
  origin: string,
  pathname: string,
  parameters: Record<string, ParameterEntry | undefined>,
  syncable: ReadonlySet<string>,
): { url: string; unsynced: string[] } {
  const unsynced: string[] = [];
  for (const [name, entry] of Object.entries(parameters)) {
    const value = entry?.value;
    if (value === undefined || value === null || String(value) === "") continue;
    if (syncable.has(name)) continue;
    // ponytail: a text parameter literally named `x_from` shows as `x`;
    // the store carries no widget link to disambiguate, and the URL layer
    // makes the same assumption.
    const widgetName = name.replace(COMPANION_SUFFIX, "");
    if (!unsynced.includes(widgetName)) unsynced.push(widgetName);
  }
  return {
    url: `${origin}${buildParamsUrl(pathname, parameters, syncable)}`,
    unsynced,
  };
}
