/**
 * Thin adapter that re-exports connection package symbols using CJS require().
 *
 * The connection package ships as TypeScript source — its type definitions
 * reference internal neo4j-driver-core paths that don't resolve under the
 * app's strict tsconfig.  By importing via require() this module stays opaque
 * to the type checker while still providing typed exports that downstream
 * code (query-executor.ts) can use.
 *
 * Isolating the require() calls here also makes query-executor.ts fully
 * mockable in Vitest (vi.mock("./connection-adapter", …)).
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const factory: any = require("connection/src/adapters/factory");
const interfaces: any = require("connection/src/generalized/interfaces");
const config: any = require("connection/src/ConnectionModuleConfig");
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
