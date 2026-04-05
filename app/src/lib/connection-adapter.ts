/**
 * Thin adapter that re-exports connection package symbols.
 *
 * The connection package ships as TypeScript source — its type definitions
 * reference internal neo4j-driver-core paths that don't resolve under the
 * app's strict tsconfig.  We use Node's `createRequire` to load the
 * modules at runtime, keeping the type checker opaque to the package
 * internals while ensuring Turbopack doesn't try to bundle them.
 *
 * Isolating the require() calls here also makes query-executor.ts fully
 * mockable in Vitest (vi.mock("./connection-adapter", …)).
 */

import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
const factory: any = require_("@neoboard/connection/src/adapters/factory");
const interfaces: any = require_(
  "@neoboard/connection/src/generalized/interfaces",
);
const config: any = require_("@neoboard/connection/src/ConnectionModuleConfig");
/* eslint-enable @typescript-eslint/no-explicit-any */

export const createConnectionModule: (
  type: number,
  authConfig: Record<string, unknown>,
  advancedOptions?: Record<string, unknown>,
) => unknown = factory.createConnectionModule;

export const DEFAULT_CONNECTION_CONFIG: Record<string, unknown> =
  interfaces.DEFAULT_CONNECTION_CONFIG;

export const ConnectionTypes: { NEO4J: number; POSTGRESQL: number } =
  config.ConnectionTypes;
