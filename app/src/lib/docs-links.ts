// The docs publish only as a GitHub Pages project site (#1213). Whole URLs,
// not a host joined to paths, so the docs guard
// (scripts/__tests__/docs-accuracy.test.mjs) checks each route and the org
// transfer's owner rename finds each one.
export const DOCS_LINKS = {
  firstDashboard:
    "https://alfredo1996.github.io/neoboard/start-here/first-dashboard/",
  widgets: "https://alfredo1996.github.io/neoboard/using/widgets/",
  enterprise: "https://alfredo1996.github.io/neoboard/start-here/enterprise/",
} as const;
