/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+.tsx?$': ['ts-jest', {}],
  },
  testPathIgnorePatterns: ['utils'],
  globalSetup: './__tests__/utils/setup.ts',
  globalTeardown: './__tests__/utils/teardown.ts',
  // Integration tests hit a live Neo4j/PostgreSQL testcontainer.
  // Even after the Bolt healthcheck in globalSetup, parallel workers
  // compete for connections, so individual queries can exceed Jest's
  // 5 s default. 15 s covers all realistic cases without masking hangs.
  testTimeout: 15000,
  collectCoverage: true,
  coverageDirectory: 'coverage', // default output dir
  coverageReporters: ['lcov', 'json'], // choose as needed
};
