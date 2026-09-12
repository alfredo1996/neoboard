import type { ParameterEntry } from "@/stores/parameter-store";
import { buildParamsUrl, isSet } from "@/lib/shared/url-params";

/**
 * Companion keys that range widgets write beside their parameter name
 * (`period_from`, `amount_max`, …). Mirrors `COMPANION_SUFFIXES` in
 * url-params.ts and `SUB_PARAM_SUFFIXES` in format-parameter-value.ts.
 */
const COMPANION_SUFFIX = /_(from|to|min|max)$/;

/** A set parameter the link cannot carry. */
export interface UnsyncedParameter {
  /** Widget-level name: `period_from` and `period_to` fold to `period`. */
  name: string;
  /**
   * The parameter widget whose "Sync to URL" toggle would fix it. Absent for
   * a click-action, URL or cross-dashboard value — there is no toggle to flip.
   */
  widgetId?: string;
}

/**
 * The link "Copy link with current filters" puts on the clipboard, plus the
 * parameters it had to leave out.
 *
 * `syncable` is the per-widget "Sync to URL" allow-list (`extractSyncParams`);
 * a set parameter outside it is reported under its widget name so the user
 * can go and turn the toggle on. Cleared parameters are not reported — an
 * empty value is not something the link fails to carry — and neither is a
 * widget default the user never touched: the recipient's own load re-applies
 * it (#1421). `pageIndex` is the page being viewed; `?page=` is honoured on
 * first load.
 */
export function buildShareLink(
  origin: string,
  pathname: string,
  parameters: Record<string, ParameterEntry | undefined>,
  syncable: ReadonlySet<string>,
  pageIndex = 0,
): { url: string; unsynced: UnsyncedParameter[] } {
  const unsynced: UnsyncedParameter[] = [];
  for (const [name, entry] of Object.entries(parameters)) {
    if (!entry || !isSet(entry.value)) continue;
    if (syncable.has(name) || entry.sourceType === "default") continue;
    // ponytail: a text parameter literally named `x_from` shows as `x`;
    // the store carries no widget link to disambiguate, and the URL layer
    // makes the same assumption.
    const widgetName = name.replace(COMPANION_SUFFIX, "");
    if (unsynced.some((u) => u.name === widgetName)) continue;
    unsynced.push({
      name: widgetName,
      widgetId:
        entry.sourceType === "selector-widget"
          ? entry.sourceWidgetId
          : undefined,
    });
  }
  const link = new URL(buildParamsUrl(pathname, parameters, syncable), origin);
  if (pageIndex > 0) {
    link.searchParams.set("page", String(pageIndex));
    link.searchParams.sort();
  }
  return { url: link.href, unsynced };
}
