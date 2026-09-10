/**
 * Chart types disabled in the picker (#1158) — "ship less, but better".
 * Their plugins stay REGISTERED so existing dashboards keep rendering; they're
 * just filtered out of the new-widget / change-type list. To re-enable one,
 * remove it here — no other change needed.
 *
 * Its own import-free module so the demo-seed test in scripts/__tests__ can
 * import it (#1722); cli/src/__tests__/commands/plugin.test.ts scrapes every
 * quoted line of chart-types.ts, so it cannot live there.
 */
export const DISABLED_CHART_TYPES: ReadonlySet<string> = new Set([
  "choropleth",
  "radar",
]);
