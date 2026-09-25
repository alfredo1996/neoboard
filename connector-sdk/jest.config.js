/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  // Floors, not targets: a few points under the values measured on
  // 2026-09-06, so ordinary churn does not trip them but a real regression
  // does. Nothing enforced coverage before this (#1608). Raise a floor when
  // the real number rises; never lower one to go green.
  coverageThreshold: {
    global: { statements: 87, branches: 79, functions: 80, lines: 88 },
  },
  testEnvironment: "node",
  // `diagnostics: false` keeps each run fast; the tests are type-checked by
  // `npm run typecheck` and the CI typecheck job instead, whose tsconfig
  // includes __tests__ (#1918).
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: false }],
  },
  testPathIgnorePatterns: ["/dist/"],
  // Pure unit tests only — the SDK has no integration tests and no Docker
  // dependency, unlike the connection package it was extracted from.
};
