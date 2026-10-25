/**
 * Matching a choropleth row to a Natural Earth country (#2230).
 *
 * A row names its country by ISO alpha-2, ISO alpha-3, or a name. Codes win
 * when the cell is two or three letters; otherwise the name is looked up
 * (Natural Earth's short name, its long name, or an alias). A row that matches
 * nothing is returned, not dropped, so the chart can say so.
 *
 * Own module, no React or echarts, so a node test and the plugin can import it.
 */

export interface RegionFeature {
  properties: {
    name: string;
    iso2?: string | null;
    iso3?: string | null;
    long?: string;
  };
}

export interface RegionRow {
  name: string;
  value: number | null;
}

/**
 * Names data commonly uses that neither Natural Earth's short nor long name
 * says. Lowercase key -> Natural Earth `name`. The first block is what the
 * chart accepted before Natural Earth, so saved dashboards keep matching.
 */
const ALIASES: Record<string, string> = {
  "united states": "United States of America",
  usa: "United States of America",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  korea: "South Korea",
  "dem. rep. korea": "North Korea",
  "czech republic": "Czechia",
  "bosnia and herzegovina": "Bosnia and Herz.",
  "democratic republic of the congo": "Dem. Rep. Congo",
  "ivory coast": "Côte d'Ivoire",
  swaziland: "eSwatini",
  macedonia: "North Macedonia",
  burma: "Myanmar",
  turkiye: "Turkey",
  türkiye: "Turkey",
  "east timor": "Timor-Leste",
  "czech rep.": "Czechia",
  xkx: "Kosovo",
  kos: "Kosovo",
  "viet nam": "Vietnam",
  "cote d'ivoire": "Côte d'Ivoire",
  macau: "Macao",
  uae: "United Arab Emirates",
  drc: "Dem. Rep. Congo",
};

export interface RegionIndex {
  byIso2: Map<string, string>;
  byIso3: Map<string, string>;
  byName: Map<string, string>;
}

export function buildRegionIndex(features: RegionFeature[]): RegionIndex {
  const index: RegionIndex = {
    byIso2: new Map(),
    byIso3: new Map(),
    byName: new Map(),
  };
  for (const { properties: p } of features) {
    if (p.iso2) index.byIso2.set(p.iso2.toLowerCase(), p.name);
    if (p.iso3) index.byIso3.set(p.iso3.toLowerCase(), p.name);
    index.byName.set(p.name.toLowerCase(), p.name);
    if (p.long) index.byName.set(p.long.toLowerCase(), p.name);
  }
  return index;
}

function resolveRegion(raw: unknown, index: RegionIndex): string | undefined {
  // A LEFT JOIN with no match gives null, a Cypher property can be a number.
  if (raw === null || raw === undefined) return undefined;
  const key = String(raw).trim().toLowerCase();
  if (!key) return undefined;
  const alias = Object.hasOwn(ALIASES, key) ? ALIASES[key] : "";
  const codes = { 2: index.byIso2, 3: index.byIso3 }[key.length];
  return (
    codes?.get(key) ??
    index.byName.get(key) ??
    index.byName.get(alias.toLowerCase())
  );
}

export function matchRegions(
  rows: RegionRow[],
  index: RegionIndex,
): { matched: RegionRow[]; unmatched: RegionRow[] } {
  const matched: RegionRow[] = [];
  const unmatched: RegionRow[] = [];
  for (const row of rows) {
    const name = resolveRegion(row.name, index);
    if (name) matched.push({ ...row, name });
    else unmatched.push(row);
  }
  return { matched, unmatched };
}
