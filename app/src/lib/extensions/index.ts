/**
 * NeoBoard extension points.
 *
 * Enterprise modules register handlers into these points via
 * `bootstrapExtensions()` at app startup. The core app reads
 * registered handlers at runtime to invoke enterprise behavior.
 *
 * Adding a new extension point:
 * 1. Define the handler type in `types.ts`
 * 2. Add a `createExtensionPoint<NewType>()` entry below
 * 3. Core code reads `extensions.newPoint.getAll()` where needed
 */

import { createExtensionPoint } from "./registry";
import type {
  AuthProviderExtension,
  PermissionExtension,
  ResourceFilterExtension,
  RoleProviderExtension,
} from "./types";
import type { QueryMiddlewareExtension } from "@/lib/query/pipeline-types";

const createExtensions = () =>
  ({
    /** NextAuth providers contributed by enterprise (SSO). */
    authProviders: createExtensionPoint<AuthProviderExtension>(),
    /** Chain-of-responsibility permission checkers (custom roles, groups). */
    permissionCheckers: createExtensionPoint<PermissionExtension>(),
    /** Resource list filters (e.g. group-scoped dashboards). */
    resourceFilters: createExtensionPoint<ResourceFilterExtension>(),
    /** Custom role definitions beyond admin/creator/reader. */
    roleProviders: createExtensionPoint<RoleProviderExtension>(),
    /** Query execution middleware (cache, audit, impersonation, rate limiting). */
    queryMiddleware: createExtensionPoint<QueryMiddlewareExtension>(),
  }) as const;

export type Extensions = ReturnType<typeof createExtensions>;

/**
 * One registry per process, held on `globalThis` — not per copy of this
 * module. Next.js compiles instrumentation.ts and each route handler into
 * separate bundles, and each inlines its own copy: the middleware registered
 * at boot landed in instrumentation's, the query routes read their own empty
 * one, and in a production build the scheduler and the audit log never ran
 * (#1888).
 */
const globalRegistry = globalThis as typeof globalThis & {
  __neoboardExtensions?: Extensions;
};

export const extensions = (globalRegistry.__neoboardExtensions ??=
  createExtensions());

export { createExtensionPoint, type ExtensionPoint } from "./registry";

export type {
  AuthProviderExtension,
  PermissionExtension,
  PermissionContext,
  PermissionDecision,
  ResourceFilterExtension,
  RoleDefinition,
  RoleProviderExtension,
} from "./types";

export type {
  QueryContext,
  QueryMiddlewareExtension,
  QueryMiddlewareFn,
  QueryResult,
} from "@/lib/query/pipeline-types";
