/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: false }],
    "^.+\\.m?js$": ["ts-jest", { diagnostics: false, useESM: false }],
  },
  // uuid v14+ ships ESM only; transform it (and any future ESM-only deps in
  // the testcontainers→dockerode chain) so Jest's CJS runtime can require them.
  transformIgnorePatterns: ["/node_modules/(?!(uuid)/)"],
  // Skip the built `dist/` output — adding the JS transform above means jest
  // would otherwise pick up compiled `.test.js` and `.test.d.ts` files from
  // a previous `tsc -p tsconfig.build.json` and double-run them.
  testPathIgnorePatterns: ["utils", "/dist/"],
  globalSetup: "./__tests__/utils/setup.ts",
  globalTeardown: "./__tests__/utils/teardown.ts",
  // Integration tests hit a live Neo4j/PostgreSQL testcontainer.
  // Even after the Bolt healthcheck in globalSetup, parallel workers
  // compete for connections, so individual queries can exceed Jest's
  // 5 s default. 15 s covers all realistic cases without masking hangs.
  testTimeout: 15000,
  collectCoverage: true,
  coverageDirectory: "coverage", // default output dir
  coverageReporters: ["lcov", "json"], // choose as needed
};
