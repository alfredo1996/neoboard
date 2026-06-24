/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: false }],
  },
  testPathIgnorePatterns: ["/dist/"],
  // Pure unit tests only — the SDK has no integration tests and no Docker
  // dependency, unlike the connection package it was extracted from.
};
