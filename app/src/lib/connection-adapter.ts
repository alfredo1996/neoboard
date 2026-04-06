/**
 * Thin adapter that re-exports connection package symbols using CJS require().
 *
 * The connection package (@neoboard/connection) ships as TypeScript source.
 * It's listed in `transpilePackages` in next.config.ts so webpack compiles
 * it as part of the app build — no separate build step needed.
 *
 * We use require() (not ESM import) to keep the type checker opaque to the
 * connection package's internal types which reference neo4j-driver-core
 * paths that don't resolve under the app's strict tsconfig.
 *
 * IMPORTANT: This requires `--webpack` flag (not Turbopack) because
 * Turbopack doesn't correctly handle CJS require() for transpiled packages.
 * See: https://github.com/vercel/next.js/issues/85316
 *
 * Isolating the require() calls here also makes query-executor.ts fully
 * mockable in Vitest (vi.mock("./connection-adapter", …)).
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const factory: any = require("@neoboard/connection/src/adapters/factory");
const interfaces: any = require("@neoboard/connection/src/generalized/interfaces");
const config: any = require("@neoboard/connection/src/ConnectionModuleConfig");
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

export const createConnectionModule: (
  type: number,
  authConfig: Record<string, unknown>,
  advancedOptions?: Record<string, unknown>,
) => unknown = factory.createConnectionModule;

export const DEFAULT_CONNECTION_CONFIG: Record<string, unknown> =
  interfaces.DEFAULT_CONNECTION_CONFIG;

export const ConnectionTypes: { NEO4J: number; POSTGRESQL: number } =
  config.ConnectionTypes;
