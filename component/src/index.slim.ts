// /design-sync slim entry — excludes the 4 components whose engines exceed the
// 5MB upload cap (GraphChart→NVL, MapChart→Leaflet, ChoroplethChart→world.geo,
// QueryEditor→cypher-lang). Shiki is stubbed via vite alias (see vite.slim.config.ts).
// These components still get .d.ts/prompt contracts + floor cards via the full
// component/index.d.ts; they just don't render live in Claude Design.
export * from "./components/ui";
export * from "./components/composed/index.slim";
export * from "./charts/index.slim";
export * from "./hooks";
export * from "./utils";
