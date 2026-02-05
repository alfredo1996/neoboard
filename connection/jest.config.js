/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+.tsx?$': ['ts-jest', {}],
  },
  testPathIgnorePatterns: ['utils'],
  globalSetup: './__tests__/utils/setup.ts',
  globalTeardown: './__tests__/utils/teardown.ts',
  collectCoverage: true,
  coverageDirectory: 'coverage', // default output dir
  coverageReporters: ['lcov', 'json'], // choose as needed
};
